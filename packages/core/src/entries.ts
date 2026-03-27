import fs from 'fs';
import path from 'path';
import { Entry, type EntryStatus } from '@moteurio/types/Model.js';
import { isValidId } from './utils/idUtils.js';
import { entryFilePath, trashEntryDir, projectDir } from './utils/pathUtils.js';
import { User } from '@moteurio/types/User.js';
import { getModelSchema } from './models.js';
import { getProject } from './projects.js';
import { hasApprovedReview } from './reviews.js';
import { triggerEvent } from './utils/eventBus.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { entryKey, entryListPrefix } from './utils/storageKeys.js';
import { addAndCommit, getLog, isGitRepo, push, show, type CommitInfo } from './git/gitService.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { runEntryScanDebounced } from './radar/index.js';
import {
    getCoreIdFieldIds,
    stripCoreIdFromData,
    ensureCoreIdValues
} from './utils/coreIdFields.js';
import { validateBlockLocalesInPayload } from './utils/validateBlockLocales.js';
import * as publishedCache from './git/publishedContentCache.js';
import { log, toActivityEvent } from './activityLogger.js';

export type ListEntriesForProjectOptions = {
    status?: EntryStatus | EntryStatus[];
};

export type EntryServiceOptions = {
    source?: 'api' | 'studio' | 'scheduler';
};

export type EntryRevision = {
    id: string;
    number: number;
    message: string;
    savedAt: string;
    savedBy?: string;
};

/**
 * List entries for a project/model without user check. For internal use (e.g. collection API).
 */
export async function listEntriesForProject(
    projectId: string,
    modelId: string,
    options?: ListEntriesForProjectOptions
): Promise<Entry[]> {
    const ids = await listProjectKeys(projectId, entryListPrefix(modelId));
    const entries = (
        await Promise.all(ids.map(id => getProjectJson<Entry>(projectId, entryKey(modelId, id))))
    ).filter((e): e is Entry => e != null);
    const statusFilter = options?.status ?? ['published'];
    const statuses = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
    return entries.filter(e => statuses.includes((e.status ?? 'draft') as EntryStatus));
}

/**
 * Get one entry by id without user check. For internal use (e.g. collection API). Returns null if not found.
 */
export async function getEntryForProject(
    projectId: string,
    modelId: string,
    entryId: string
): Promise<Entry | null> {
    if (!entryId || !isValidId(entryId)) return null;
    const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
    return entry ?? null;
}

export async function listEntries(
    user: User,
    projectId: string,
    modelId: string
): Promise<Entry[]> {
    const _schema = await getModelSchema(user, projectId, modelId);

    const ids = await listProjectKeys(projectId, entryListPrefix(modelId));
    return (
        await Promise.all(ids.map(id => getProjectJson<Entry>(projectId, entryKey(modelId, id))))
    ).filter((e): e is Entry => e != null);
}

export async function getEntry(
    user: User,
    projectId: string,
    modelId: string,
    entryId: string
): Promise<Entry> {
    if (!entryId || !isValidId(entryId)) {
        throw new Error(`Invalid entry ID: ${entryId}`);
    }

    await getModelSchema(user, projectId, modelId);

    const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
    if (!entry) {
        throw new Error(
            `Entry "${entryId}" not found in model "${modelId}" of project "${projectId}".`
        );
    }
    return entry;
}

export async function createEntry(
    user: User,
    projectId: string,
    modelId: string,
    entry: Entry,
    options?: EntryServiceOptions
): Promise<Entry> {
    if (!entry || !entry.id || !isValidId(entry.id)) {
        throw new Error('Entry ID is required to create an entry.');
    }

    const schema = await getModelSchema(user, projectId, modelId);
    const project = await getProject(user, projectId);
    const projectLocales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
        Boolean
    );
    if (projectLocales.length > 0 && entry.data) {
        const localeErrors = validateBlockLocalesInPayload(entry.data, projectLocales, 'data');
        if (localeErrors.length > 0) {
            throw new Error(localeErrors.join(' '));
        }
    }
    const coreIdFields = getCoreIdFieldIds(schema);
    if (coreIdFields.length > 0 && entry.data) {
        entry = {
            ...entry,
            data: ensureCoreIdValues(entry.data, coreIdFields)
        };
    }

    const exists = await hasProjectKey(projectId, entryKey(modelId, entry.id));
    if (exists) {
        throw new Error(`Entry "${entry.id}" already exists in model "${modelId}".`);
    }

    triggerEvent('entry.beforeCreate', { entry, user, modelId, projectId });
    await putProjectJson(projectId, entryKey(modelId, entry.id), entry);
    triggerEvent('content.saved', {
        projectId,
        paths: [entryKey(modelId, entry.id)],
        message: `Create ${modelId}/${entry.data?.slug ?? entry.id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('entry.afterCreate', { entry, user, modelId, projectId });

    try {
        runEntryScanDebounced(projectId, modelId, entry.id, { source: options?.source ?? 'api' });
    } catch {
        // never fail the operation
    }
    try {
        webhookDispatch(
            'entry.created',
            {
                entryId: entry.id,
                modelId,
                status: (entry.status ?? 'draft') as string,
                locale: entry.data?.locale,
                slug: entry.data?.slug,
                updatedBy: user.id
            },
            { projectId, source: options?.source ?? 'api' }
        );
    } catch {
        // never fail the operation
    }
    return entry;
}

export async function updateEntry(
    user: User,
    projectId: string,
    modelId: string,
    entryId: string,
    patch: Partial<Entry>,
    options?: EntryServiceOptions
): Promise<Entry> {
    if (!entryId || !isValidId(entryId)) {
        throw new Error(`Invalid entry ID: ${entryId}`);
    }

    const current = await getEntry(user, projectId, modelId, entryId);
    const prevStatus = (current.status ?? 'draft') as string;
    const wantsPublish = patch.status === 'published' && prevStatus !== 'published';

    // When transitioning to published, save data first then delegate to publishEntry
    // so that publishedCommit/publishedRevision are always set correctly.
    if (wantsPublish) {
        const { status: _status, ...dataPatch } = patch;
        if (Object.keys(dataPatch).length > 0) {
            await updateEntry(user, projectId, modelId, entryId, dataPatch, options);
        }
        return publishEntry(user, projectId, modelId, entryId, options);
    }

    if (patch.status === 'published') {
        const project = await getProject(user, projectId);
        if (project.workflow?.enabled && project.workflow?.requireReview) {
            const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
            if (!isAdmin) {
                const approved = await hasApprovedReview(projectId, modelId, entryId);
                if (!approved) {
                    throw new Error(
                        'Publishing requires an approved review when the project has review workflow enabled.'
                    );
                }
            }
        }
    }

    const schema = await getModelSchema(user, projectId, modelId);
    const project = await getProject(user, projectId);
    const projectLocales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
        Boolean
    );
    if (projectLocales.length > 0 && patch.data) {
        const dataToValidate = { ...current.data, ...patch.data };
        const localeErrors = validateBlockLocalesInPayload(dataToValidate, projectLocales, 'data');
        if (localeErrors.length > 0) {
            throw new Error(localeErrors.join(' '));
        }
    }
    const coreIdFields = getCoreIdFieldIds(schema);
    let sanitizedPatch: Partial<Entry> = { ...patch };
    if (patch.data && coreIdFields.length > 0) {
        sanitizedPatch = {
            ...patch,
            data: { ...current.data, ...stripCoreIdFromData(patch.data, coreIdFields) }
        };
    }
    const updated = { ...current, ...sanitizedPatch };

    triggerEvent('entry.beforeUpdate', { entry: updated, user, modelId, projectId });
    await putProjectJson(projectId, entryKey(modelId, entryId), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [entryKey(modelId, entryId)],
        message: `Update ${modelId}/${updated.data?.slug ?? entryId} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('entry.afterUpdate', { entry: updated, user, modelId, projectId });

    try {
        runEntryScanDebounced(projectId, modelId, entryId, { source: options?.source ?? 'api' });
    } catch {
        // never fail the operation
    }
    const source = options?.source ?? 'api';
    const newStatus = (updated.status ?? 'draft') as string;
    const payloadEntry = {
        entryId,
        modelId,
        status: newStatus,
        locale: updated.data?.locale,
        slug: updated.data?.slug,
        updatedBy: user.id
    };
    try {
        webhookDispatch('entry.updated', payloadEntry, { projectId, source });
        if (prevStatus === 'published' && newStatus === 'unpublished') {
            webhookDispatch('entry.unpublished', payloadEntry, { projectId, source });
        }
    } catch {
        // never fail the operation
    }
    return updated;
}

export async function deleteEntry(
    user: User,
    projectId: string,
    modelId: string,
    entryId: string,
    options?: EntryServiceOptions
): Promise<void> {
    const entry = await getEntry(user, projectId, modelId, entryId);

    triggerEvent('entry.beforeDelete', { entry, user, modelId, projectId });

    const trashDir = trashEntryDir(projectId, modelId, entryId);
    fs.mkdirSync(trashDir, { recursive: true });

    const dest = path.join(trashDir, `${entryId}-${Date.now()}.json`);
    fs.renameSync(entryFilePath(projectId, modelId, entryId), dest);

    triggerEvent('content.deleted', {
        projectId,
        paths: [entryKey(modelId, entryId)],
        message: `Delete ${modelId}/${entry.data?.slug ?? entryId} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('entry.afterDelete', { entry, user, modelId, projectId });

    try {
        webhookDispatch(
            'entry.deleted',
            {
                entryId,
                modelId,
                status: (entry.status ?? 'draft') as string,
                locale: entry.data?.locale,
                slug: entry.data?.slug,
                updatedBy: user.id
            },
            { projectId, source: options?.source ?? 'api' }
        );
    } catch {
        // never fail the operation
    }
}

// ---------------------------------------------------------------------------
// Publish (git-native: single file, commit-hash pointer)
// ---------------------------------------------------------------------------

/**
 * Publish an entry: sets status to published, commits, captures the commit hash,
 * and stores it as publishedCommit in the audit. The public API uses git show
 * with that commit to serve frozen published content even after further edits.
 *
 * Two commits: (1) the published content, (2) the publishedCommit pointer.
 * Respects the review workflow guard.
 */
export async function publishEntry(
    user: User,
    projectId: string,
    modelId: string,
    entryId: string,
    options?: EntryServiceOptions
): Promise<Entry> {
    if (!entryId || !isValidId(entryId)) {
        throw new Error(`Invalid entry ID: ${entryId}`);
    }

    const project = await getProject(user, projectId);
    if (project.workflow?.enabled && project.workflow?.requireReview) {
        const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
        if (!isAdmin) {
            const approved = await hasApprovedReview(projectId, modelId, entryId);
            if (!approved) {
                throw new Error(
                    'Publishing requires an approved review when the project has review workflow enabled.'
                );
            }
        }
    }

    const entry = await getEntry(user, projectId, modelId, entryId);
    const now = new Date().toISOString();
    const revision = entry.meta?.audit?.revision ?? 1;

    entry.status = 'published';
    entry.meta = entry.meta || {};
    entry.meta.audit = {
        ...entry.meta.audit,
        publishedRevision: revision,
        publishedAt: now
    };

    triggerEvent('entry.beforeUpdate', { entry, user, modelId, projectId });

    // Write + commit to capture the published content
    await putProjectJson(projectId, entryKey(modelId, entryId), entry);
    const dir = projectDir(projectId);
    let commitHash: string | undefined;
    if (isGitRepo(dir)) {
        try {
            const h = addAndCommit(
                dir,
                [entryKey(modelId, entryId)],
                `Publish ${modelId}/${entry.data?.slug ?? entryId} — ${user.name ?? user.id}`,
                user
            );
            commitHash = h || undefined;
            if (h) {
                log(
                    toActivityEvent(projectId, 'git', 'repo', 'git_committed', user, undefined, {
                        commit: h,
                        paths: [entryKey(modelId, entryId)],
                        context: 'publish_entry'
                    })
                );
            }
        } catch (err) {
            log(
                toActivityEvent(projectId, 'git', 'repo', 'git_commit_failed', user, undefined, {
                    error: err instanceof Error ? err.message : String(err),
                    context: 'publish_entry',
                    paths: [entryKey(modelId, entryId)]
                })
            );
            // git errors are non-fatal
        }
    }

    // Record the commit hash, pre-warm cache, and write again
    if (commitHash) {
        // Pre-warm cache with the published content at this commit.
        // The entry right now (before we add publishedCommit) is exactly what
        // git show <commitHash>:path would return, so we can cache it directly.
        const key = entryKey(modelId, entryId);
        publishedCache.set(commitHash, key, JSON.stringify(entry));

        entry.meta.audit.publishedCommit = commitHash;
        await putProjectJson(projectId, entryKey(modelId, entryId), entry);
        if (isGitRepo(dir)) {
            try {
                const pointerHash = addAndCommit(
                    dir,
                    [entryKey(modelId, entryId)],
                    `Record publishedCommit for ${modelId}/${entryId}`,
                    user
                );
                if (pointerHash) {
                    log(
                        toActivityEvent(
                            projectId,
                            'git',
                            'repo',
                            'git_committed',
                            user,
                            undefined,
                            {
                                commit: pointerHash,
                                paths: [entryKey(modelId, entryId)],
                                context: 'publish_entry_pointer'
                            }
                        )
                    );
                }
                if (!push(dir)) {
                    log(
                        toActivityEvent(
                            projectId,
                            'git',
                            'repo',
                            'git_push_failed',
                            user,
                            undefined,
                            {
                                context: 'publish_entry',
                                paths: [entryKey(modelId, entryId)]
                            }
                        )
                    );
                }
            } catch (err) {
                log(
                    toActivityEvent(
                        projectId,
                        'git',
                        'repo',
                        'git_commit_failed',
                        user,
                        undefined,
                        {
                            error: err instanceof Error ? err.message : String(err),
                            context: 'publish_entry_pointer',
                            paths: [entryKey(modelId, entryId)]
                        }
                    )
                );
                // git errors are non-fatal
            }
        }
    } else {
        // No git: still fire the regular event so other hooks (activity, etc.) run
        triggerEvent('content.saved', {
            projectId,
            paths: [entryKey(modelId, entryId)],
            message: `Publish ${modelId}/${entry.data?.slug ?? entryId} — ${user.name ?? user.id}`,
            user
        });
    }

    triggerEvent('entry.afterUpdate', { entry, user, modelId, projectId });

    const source = options?.source ?? 'api';
    try {
        webhookDispatch(
            'entry.published',
            {
                entryId,
                modelId,
                status: 'published',
                locale: entry.data?.locale,
                slug: entry.data?.slug,
                updatedBy: user.id
            },
            { projectId, source }
        );
    } catch {
        // never fail the operation
    }
    return entry;
}

// ---------------------------------------------------------------------------
// Revision history (git-based)
// ---------------------------------------------------------------------------

/**
 * Get revision history for an entry from git log.
 * Each commit that touched the entry file is one revision (newest first).
 */
export function getEntryRevisions(
    projectId: string,
    modelId: string,
    entryId: string,
    maxCount = 20
): EntryRevision[] {
    const dir = projectDir(projectId);
    const relativePath = entryKey(modelId, entryId);
    const commits: CommitInfo[] = getLog(dir, relativePath, maxCount);

    return commits.map((c, i) => ({
        id: c.hash,
        number: commits.length - i,
        message: c.message,
        savedAt: c.date,
        savedBy: c.authorName
    }));
}

// ---------------------------------------------------------------------------
// Public API: git-based published content
// ---------------------------------------------------------------------------

/**
 * Get the published version of an entry via git show.
 *
 * - If publishedCommit exists and revision > publishedRevision, reads the entry
 *   from git at that commit (the frozen published content).
 * - Otherwise falls back to entry.json (either fully published or legacy entry).
 */
export async function getPublishedEntryForProject(
    projectId: string,
    modelId: string,
    entryId: string
): Promise<Entry | null> {
    if (!entryId || !isValidId(entryId)) return null;
    const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
    if (!entry) return null;

    const audit = entry.meta?.audit;
    if (
        audit?.publishedCommit &&
        audit.publishedRevision != null &&
        audit.revision != null &&
        audit.revision > audit.publishedRevision
    ) {
        const key = entryKey(modelId, entryId);

        // Check in-memory cache first (commit hashes are immutable — always fresh)
        const cached = publishedCache.get(audit.publishedCommit, key);
        if (cached) {
            try {
                return JSON.parse(cached) as Entry;
            } catch {
                /* fall through */
            }
        }

        // Cache miss: read from git, then populate cache
        const dir = projectDir(projectId);
        const raw = show(dir, audit.publishedCommit, key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as Entry;
                publishedCache.set(audit.publishedCommit, key, raw);
                return parsed;
            } catch {
                // corrupt git data — fall through to latest
            }
        }
    }
    return entry;
}

/**
 * List published entries. Uses git show for entries with unpublished changes.
 */
export async function listPublishedEntriesForProject(
    projectId: string,
    modelId: string,
    options?: ListEntriesForProjectOptions
): Promise<Entry[]> {
    const ids = await listProjectKeys(projectId, entryListPrefix(modelId));
    const entries = (
        await Promise.all(ids.map(id => getPublishedEntryForProject(projectId, modelId, id)))
    ).filter((e): e is Entry => e != null);
    const statusFilter = options?.status ?? ['published'];
    const statuses = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
    return entries.filter(e => statuses.includes((e.status ?? 'draft') as EntryStatus));
}

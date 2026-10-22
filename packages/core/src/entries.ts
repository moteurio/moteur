import { sameContent, type Restored } from './utils/sameContent.js';
import fs from 'fs';
import path from 'path';
import { approvalMessage, needsApproval } from '@moteurio/types';
import { Entry, type EntryStatus } from '@moteurio/types/Model.js';
import {
    assertCanEdit,
    assertCanWrite,
    contentForbidden,
    translationOnlyChange,
    translatorOnly
} from './contentAccess.js';
import { isValidId } from './utils/idUtils.js';
import { entryFilePath, trashEntryDir, projectDir } from './utils/pathUtils.js';
import { User } from '@moteurio/types/User.js';
import { getModelSchema } from './models.js';
import { getProject } from './projects.js';
import { hasApprovedReview } from './reviews.js';
import { triggerEvent } from './utils/eventBus.js';
import { getProjectJson, putProjectJson, hasProjectKey } from './utils/projectStorage.js';
import { entryKey } from './utils/storageKeys.js';
import { addAndCommit, getLog, isGitRepo, push, show, type CommitInfo } from './git/gitService.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { runEntryScanDebounced } from './radar/index.js';
import {
    getCoreIdFieldIds,
    stripCoreIdFromData,
    ensureCoreIdValues
} from './utils/coreIdFields.js';
import { addsAssisted, agentMarks, stampAssisted } from './assisted.js';
import { assertEntryComplete } from './validators/entryComplete.js';
import { validateBlockLocalesInPayload } from './utils/validateBlockLocales.js';
import * as publishedCache from './git/publishedContentCache.js';
import { log, toActivityEvent } from './activityLogger.js';
import {
    getContentIndex,
    publishedSnapshotCommit,
    type EntryQuery,
    type EntryQueryResult
} from './contentIndex/index.js';
import { readPublishedSnapshots } from './contentIndex/entryFiles.js';
import { checkCountRoom } from './planLimits.js';
import { countOf } from './projectCounts.js';

/** How an entry is named in commit messages: its slug when it is a plain string, else its id. */
function commitRef(entry: Entry, entryId: string): string {
    const slug = entry.data?.slug;
    return typeof slug === 'string' && slug ? slug : entryId;
}

export type ListEntriesForProjectOptions = {
    status?: EntryStatus | EntryStatus[];
};

export type { EntryQuery, EntryQueryResult };

function statusList(status: EntryStatus | EntryStatus[] | undefined): EntryStatus[] {
    const value = status ?? ['published'];
    return Array.isArray(value) ? value : [value];
}

/**
 * Filter, sort and page a model's entries through the content index, without user check.
 * `view: 'published'` returns each entry's public version.
 */
export async function queryEntriesForProject(
    projectId: string,
    modelId: string,
    query: EntryQuery = {}
): Promise<EntryQueryResult> {
    return (await getContentIndex()).queryEntries(projectId, modelId, query);
}

export type EntryServiceOptions = {
    source?: 'api' | 'studio' | 'scheduler';
    /** Set by restoreEntryAtRevision: `data` and helper marks replace the entry's instead of merging. */
    restoredFrom?: string;
};

export type EntryRevision = {
    id: string;
    number: number;
    message: string;
    savedAt: string;
    savedBy?: string;
};

/**
 * Apply a partial update to an entry.
 *
 * `data` merges field by field: each field in the patch replaces the stored value (send `null`
 * to clear one), fields left out keep their value. Core-id fields, the entry id and audit
 * metadata are managed by the server and can't be overwritten.
 */
export function mergeEntryPatch(
    current: Entry,
    patch: Partial<Entry>,
    coreIdFields: string[] = []
): Entry {
    const merged: Entry = { ...current, ...patch, id: current.id };
    if (patch.data !== undefined) {
        merged.data = { ...current.data, ...stripCoreIdFromData(patch.data, coreIdFields) };
    }
    if (patch.meta !== undefined) {
        merged.meta = { ...current.meta, ...patch.meta, audit: current.meta?.audit };
        if (merged.meta.audit === undefined) delete merged.meta.audit;
    }
    return merged;
}

/**
 * List entries for a project/model without user check. For internal use (e.g. collection API).
 */
export async function listEntriesForProject(
    projectId: string,
    modelId: string,
    options?: ListEntriesForProjectOptions
): Promise<Entry[]> {
    const { items } = await queryEntriesForProject(projectId, modelId, {
        status: statusList(options?.status)
    });
    return items;
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
    return (await queryEntries(user, projectId, modelId)).items;
}

/** Filter, sort and page a model's entries (every status unless `query.status` is given). */
export async function queryEntries(
    user: User,
    projectId: string,
    modelId: string,
    query: EntryQuery = {}
): Promise<EntryQueryResult> {
    await getModelSchema(user, projectId, modelId);
    return queryEntriesForProject(projectId, modelId, query);
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
    assertCanWrite(user);

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

    if (user.agent) {
        // What an agent writes is marked as such, unread until a person reads it.
        const assisted = agentMarks(
            undefined,
            {},
            entry.data ?? {},
            user.agent.name,
            user.id,
            projectLocales
        );
        entry = { ...entry, meta: { ...entry.meta, assisted } };
        if (!assisted) delete entry.meta!.assisted;
    }

    const exists = await hasProjectKey(projectId, entryKey(modelId, entry.id));
    if (exists) {
        throw new Error(`Entry "${entry.id}" already exists in model "${modelId}".`);
    }
    await checkCountRoom(projectId, 'entries', () => countOf(projectId, 'entries'));

    triggerEvent('entry.beforeCreate', { entry, user, modelId, projectId });
    await putProjectJson(projectId, entryKey(modelId, entry.id), entry);
    triggerEvent('content.saved', {
        projectId,
        paths: [entryKey(modelId, entry.id)],
        message: `Create ${modelId}/${commitRef(entry, entry.id)} — ${user.name ?? user.id}`,
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
    assertCanEdit(user);
    if (
        translatorOnly(user) &&
        (wantsPublish ||
            (patch.status != null && patch.status !== prevStatus) ||
            patch.meta != null)
    ) {
        throw contentForbidden('A translator can only change other languages.');
    }

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
        if (needsApproval(user, project)) {
            const approved = await hasApprovedReview(projectId, modelId, entryId);
            if (!approved) throw contentForbidden(approvalMessage(user, project));
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
    const updated = mergeEntryPatch(current, patch, coreIdFields);
    const restoredFrom = options?.restoredFrom;
    if (restoredFrom) {
        // A restore puts back the whole version: fields filled since then are emptied again.
        const data = stripCoreIdFromData(patch.data ?? {}, coreIdFields);
        for (const id of coreIdFields) {
            if (current.data && id in current.data) data[id] = current.data[id];
        }
        updated.data = data;
    }
    if (
        translatorOnly(user) &&
        !translationOnlyChange(
            current.data ?? {},
            updated.data ?? {},
            projectLocales,
            project.defaultLocale
        )
    ) {
        throw contentForbidden('A translator can only change other languages.');
    }
    // Helper marks: who kept and who read are stamped here, never taken from the client.
    let withHelp = false;
    if (restoredFrom) {
        // The marks go back with the text they describe, as they were then.
        updated.meta = { ...updated.meta };
        if (patch.meta?.assisted) updated.meta.assisted = patch.meta.assisted;
        else delete updated.meta.assisted;
    } else if (user.agent) {
        // An agent can't mark its own text as read: its marks come from what it changed.
        const assisted = agentMarks(
            current.meta?.assisted,
            current.data ?? {},
            updated.data ?? {},
            user.agent.name,
            user.id,
            projectLocales
        );
        withHelp = addsAssisted(current.meta?.assisted, assisted);
        updated.meta = { ...updated.meta };
        if (assisted) updated.meta.assisted = assisted;
        else delete updated.meta.assisted;
    } else if (patch.meta && 'assisted' in patch.meta) {
        const assisted = stampAssisted(current.meta?.assisted, patch.meta.assisted, user.id);
        withHelp = addsAssisted(current.meta?.assisted, assisted);
        updated.meta = { ...updated.meta };
        if (assisted) updated.meta.assisted = assisted;
        else delete updated.meta.assisted;
    }
    if (patch.status === 'in_review' && prevStatus !== 'in_review') {
        assertEntryComplete(updated, schema, 'review');
    }
    // Nothing to save: no commit, no hooks, no webhooks.
    if (sameContent(current, updated)) return current;

    triggerEvent('entry.beforeUpdate', { entry: updated, user, modelId, projectId });
    await putProjectJson(projectId, entryKey(modelId, entryId), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [entryKey(modelId, entryId)],
        message: restoredFrom
            ? `Restore ${modelId}/${commitRef(updated, entryId)} from ${restoredFrom.slice(0, 7)} — ${user.name ?? user.id}`
            : `Update ${modelId}/${commitRef(updated, entryId)}${withHelp ? ' (with help)' : ''} — ${user.name ?? user.id}`,
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
    assertCanWrite(user);

    triggerEvent('entry.beforeDelete', { entry, user, modelId, projectId });

    const trashDir = trashEntryDir(projectId, modelId, entryId);
    fs.mkdirSync(trashDir, { recursive: true });

    const dest = path.join(trashDir, `${entryId}-${Date.now()}.json`);
    fs.renameSync(entryFilePath(projectId, modelId, entryId), dest);
    await (await getContentIndex()).entryRemoved(projectId, modelId, entryId);

    triggerEvent('content.deleted', {
        projectId,
        paths: [entryKey(modelId, entryId)],
        message: `Delete ${modelId}/${commitRef(entry, entryId)} — ${user.name ?? user.id}`,
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

    assertCanWrite(user);
    const project = await getProject(user, projectId);
    if (needsApproval(user, project)) {
        const approved = await hasApprovedReview(projectId, modelId, entryId);
        if (!approved) throw contentForbidden(approvalMessage(user, project));
    }

    const entry = await getEntry(user, projectId, modelId, entryId);
    assertEntryComplete(entry, await getModelSchema(user, projectId, modelId), 'publish');
    const now = new Date().toISOString();

    entry.status = 'published';
    entry.meta = entry.meta || {};
    // Hooks run first (the audit plugin bumps the revision), so the published revision is the
    // one being saved; otherwise every freshly published entry looks edited since publishing.
    await triggerEvent('entry.beforeUpdate', { entry, user, modelId, projectId });
    entry.meta.audit = {
        ...entry.meta.audit,
        publishedRevision: entry.meta.audit?.revision ?? 1,
        publishedAt: now
    };

    // Write + commit to capture the published content
    await putProjectJson(projectId, entryKey(modelId, entryId), entry);
    const dir = projectDir(projectId);
    let commitHash: string | undefined;
    if (isGitRepo(dir)) {
        try {
            const h = addAndCommit(
                dir,
                [entryKey(modelId, entryId)],
                `Publish ${modelId}/${commitRef(entry, entryId)} — ${user.name ?? user.id}`,
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
        (await getContentIndex()).publishedSnapshotTaken(
            projectId,
            modelId,
            entryId,
            commitHash,
            entry
        );

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
            message: `Publish ${modelId}/${commitRef(entry, entryId)} — ${user.name ?? user.id}`,
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

/**
 * The entry as it was saved in one revision (a commit hash from getEntryRevisions or
 * meta.audit.publishedCommit). Returns null when the hash is malformed or the entry
 * did not exist at that commit.
 */
export function getEntryAtRevision(
    projectId: string,
    modelId: string,
    entryId: string,
    revisionId: string
): Entry | null {
    if (!isValidId(modelId) || !isValidId(entryId) || !/^[0-9a-f]{7,40}$/i.test(revisionId))
        return null;
    const raw = show(projectDir(projectId), revisionId, entryKey(modelId, entryId));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as Entry;
    } catch {
        return null;
    }
}

/**
 * Put an entry back as it was saved in one revision. The restore is a new save on top of the
 * history (`Restore model/entry from abc1234`), so every version after it stays readable and can
 * be restored in turn. Only the content and its helper marks go back: the status, audit and
 * published version stay, so a published entry keeps serving what was published until it is
 * published again. When nothing differs, nothing is saved and `changed` is false.
 */
export async function restoreEntryAtRevision(
    user: User,
    projectId: string,
    modelId: string,
    entryId: string,
    revisionId: string,
    options?: EntryServiceOptions
): Promise<Restored<Entry>> {
    const current = await getEntry(user, projectId, modelId, entryId);
    const snapshot = getEntryAtRevision(projectId, modelId, entryId, revisionId);
    if (!snapshot) throw new Error('Revision not found');
    const restored = await updateEntry(
        user,
        projectId,
        modelId,
        entryId,
        { data: snapshot.data ?? {}, meta: { assisted: snapshot.meta?.assisted } },
        { ...options, restoredFrom: revisionId }
    );
    // Already the same as that version: nothing was saved.
    return { restored, changed: !sameContent(current, restored) };
}

// ---------------------------------------------------------------------------
// Public API: git-based published content
// ---------------------------------------------------------------------------

/**
 * Get the public version of an entry.
 *
 * An entry edited after publishing keeps serving the content committed at publish time
 * (`publishedCommit`), read from the content index or, failing that, from git. Otherwise the
 * entry file is the public version. An unpublished entry is returned as is (status
 * `unpublished`), so callers filtering on `published` hide it.
 */
export async function getPublishedEntryForProject(
    projectId: string,
    modelId: string,
    entryId: string
): Promise<Entry | null> {
    if (!entryId || !isValidId(entryId)) return null;
    const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
    if (!entry) return null;

    const commit = publishedSnapshotCommit(entry);
    if (!commit) return entry;
    const indexed = await (
        await getContentIndex()
    ).getPublishedSnapshot(projectId, modelId, entryId, commit);
    if (indexed) return indexed;
    const snapshots = await readPublishedSnapshots(projectId, [{ modelId, entryId, commit }]);
    // Unreadable snapshot (e.g. history rewritten): serve the entry file.
    return snapshots.get(`${commit}:${entryKey(modelId, entryId)}`) ?? entry;
}

/**
 * List the public version of a model's entries, filtered on that version's status.
 */
export async function listPublishedEntriesForProject(
    projectId: string,
    modelId: string,
    options?: ListEntriesForProjectOptions
): Promise<Entry[]> {
    const { items } = await queryEntriesForProject(projectId, modelId, {
        view: 'published',
        status: statusList(options?.status)
    });
    return items;
}

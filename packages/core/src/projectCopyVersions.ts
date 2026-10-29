import type { Entry } from '@moteurio/types/Model.js';
import { readBlobs } from './git/gitService.js';
import { publishedSnapshotCommit } from './contentIndex/publishedView.js';
import { getProjectJson, listProjectKeys, putProjectJson } from './utils/projectStorage.js';
import {
    CHANNELS_KEY,
    entryKey,
    entryListPrefix,
    modelListPrefix,
    NAVIGATIONS_KEY,
    pageKey,
    pageListPrefix,
    templateKey,
    templateListPrefix
} from './utils/storageKeys.js';

/**
 * A copied project starts its own Git history, so the published versions it copied (commits of
 * the source's history) mean nothing in it. A copy starts as its source is published: before its
 * first commit, an entry or page with edits waiting takes its published version from the source's
 * history (`asPublished`); after that commit, every published entry and page records it as its
 * published version (`pinCopy`).
 */

type Published = { entries: string[]; pages: string[] };

type Pointer = { publishedCommit?: string; publishedAt?: string };

const idsOf = (files: string[]) =>
    files.map(f => (f.endsWith('.json') ? f.slice(0, -5) : f)).filter(Boolean);

/** Each published entry and page of the copy, as published: its key, for `pinCopy`. */
export async function asPublished(sourceDir: string, projectId: string): Promise<Published> {
    const out: Published = { entries: [], pages: [] };
    const waiting: { key: string; commit: string; kind: 'entry' | 'page' }[] = [];

    for (const modelId of await listProjectKeys(projectId, modelListPrefix())) {
        for (const entryId of await listProjectKeys(projectId, entryListPrefix(modelId))) {
            const key = entryKey(modelId, entryId);
            const entry = await getProjectJson<Entry>(projectId, key);
            if (entry?.status !== 'published') continue;
            // Edited since it was published, by the same rule sites are served by.
            const commit = publishedSnapshotCommit(entry);
            if (commit) waiting.push({ key, commit, kind: 'entry' });
            else out.entries.push(key);
        }
    }
    for (const pageId of idsOf(await listProjectKeys(projectId, pageListPrefix()))) {
        const key = pageKey(pageId);
        const page = await getProjectJson<{ status?: string } & Pointer>(projectId, key);
        if (page?.status !== 'published') continue;
        if (page.publishedCommit) waiting.push({ key, commit: page.publishedCommit, kind: 'page' });
        else out.pages.push(key);
    }

    const blobs = waiting.length
        ? await readBlobs(
              sourceDir,
              waiting.map(w => `${w.commit}:${w.key}`)
          ).catch(() => new Map<string, string | null>())
        : new Map<string, string | null>();
    for (const w of waiting) {
        const raw = blobs.get(`${w.commit}:${w.key}`);
        // Its published version is gone (the source hides it too): it stays as it was, unpinned,
        // rather than its edits going live in the copy.
        if (raw == null) continue;
        const published = JSON.parse(raw) as Record<string, unknown>;
        if (w.kind === 'page') {
            // Where it sits is the current place, as sites see it.
            const now = (await getProjectJson<Record<string, unknown>>(projectId, w.key)) ?? {};
            published.parentId = now.parentId;
            published.order = now.order;
            published.status = 'published';
        }
        await putProjectJson(projectId, w.key, published);
        out[w.kind === 'entry' ? 'entries' : 'pages'].push(w.key);
    }
    return out;
}

/** Record the copy's first commit as the published version of what was published. */
export async function pinCopy(projectId: string, commit: string, published: Published) {
    const at = new Date().toISOString();
    for (const key of published.entries) {
        const entry = await getProjectJson<Entry>(projectId, key);
        if (!entry) continue;
        const audit = { ...(entry.meta?.audit ?? {}) } as NonNullable<Entry['meta']>['audit'] & {
            revision?: number;
        };
        await putProjectJson(projectId, key, {
            ...entry,
            meta: {
                ...entry.meta,
                audit: {
                    ...audit,
                    publishedCommit: commit,
                    publishedRevision: audit?.revision ?? 1
                }
            }
        });
    }
    for (const key of published.pages) {
        const page = await getProjectJson<Record<string, unknown>>(projectId, key);
        if (page)
            await putProjectJson(projectId, key, {
                ...page,
                publishedCommit: commit,
                publishedAt: at
            });
    }
}

/** What the copy keeps that names its project (pages, templates, channels, menus) names the copy. */
export async function renameCopy(projectId: string, sourceId: string): Promise<void> {
    const named = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(named);
        if (
            value &&
            typeof value === 'object' &&
            (value as Pointer & { projectId?: string }).projectId === sourceId
        )
            return { ...value, projectId };
        return value;
    };
    const keys = [
        CHANNELS_KEY,
        NAVIGATIONS_KEY,
        ...idsOf(await listProjectKeys(projectId, pageListPrefix())).map(pageKey),
        ...idsOf(await listProjectKeys(projectId, templateListPrefix())).map(templateKey)
    ];
    for (const key of keys) {
        const value = await getProjectJson<unknown>(projectId, key);
        if (value == null) continue;
        const renamed = named(value);
        if (JSON.stringify(renamed) !== JSON.stringify(value))
            await putProjectJson(projectId, key, renamed);
    }
}

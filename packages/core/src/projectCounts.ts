import fs from 'fs';
import path from 'path';
import { storageConfig } from './config/storageConfig.js';
import { getContentIndex } from './contentIndex/index.js';
import { COUNT_KINDS, type CountKind } from './planLimits.js';
import { getProjectJson, hasProjectKey, listProjectKeys } from './utils/projectStorage.js';
import {
    CHANNELS_KEY,
    formKey,
    formListPrefix,
    modelKey,
    modelListPrefix,
    pageListPrefix,
    structureKey,
    structureListPrefix,
    templateListPrefix
} from './utils/storageKeys.js';

async function present(
    projectId: string,
    prefix: string,
    key: (id: string) => string
): Promise<string[]> {
    const ids = await listProjectKeys(projectId, prefix);
    const found = await Promise.all(ids.map(id => hasProjectKey(projectId, key(id))));
    return ids.filter((_, i) => found[i]);
}

const jsonFiles = (names: string[]) => names.filter(n => n.endsWith('.json')).length;

/** The project's own models (ids). */
export function projectModelIds(projectId: string): Promise<string[]> {
    return present(projectId, modelListPrefix(), modelKey);
}

/**
 * How many of a kind the project has, the way plans count them: its own structures and blocks
 * (not core or plugin ones), entries in every status across models, and pages including folders.
 */
export async function countOf(projectId: string, kind: CountKind): Promise<number> {
    switch (kind) {
        case 'channels':
            return ((await getProjectJson<unknown[]>(projectId, CHANNELS_KEY)) ?? []).length;
        case 'models':
            return (await projectModelIds(projectId)).length;
        case 'entries': {
            const index = await getContentIndex();
            let total = 0;
            for (const modelId of await projectModelIds(projectId)) {
                total += (await index.queryEntries(projectId, modelId, { limit: 1 })).total;
            }
            return total;
        }
        case 'forms':
            return (await present(projectId, formListPrefix(), formKey)).length;
        case 'structures':
            return (await present(projectId, structureListPrefix(), structureKey)).length;
        case 'blocks':
            return countProjectBlocks(projectId);
        case 'templates':
            return jsonFiles(await listProjectKeys(projectId, templateListPrefix()));
        case 'pages':
            return jsonFiles(await listProjectKeys(projectId, pageListPrefix()));
    }
}

/** Project block files (sync: block creation is). */
export function countProjectBlocks(projectId: string): number {
    const dir = path.join(storageConfig.projectsDir, projectId, 'blocks');
    try {
        return jsonFiles(fs.readdirSync(dir));
    } catch {
        return 0;
    }
}

/** Every count, for usage. */
export async function projectCounts(projectId: string): Promise<Record<CountKind, number>> {
    const counts = await Promise.all(COUNT_KINDS.map(k => countOf(projectId, k)));
    return Object.fromEntries(COUNT_KINDS.map((k, i) => [k, counts[i]])) as Record<
        CountKind,
        number
    >;
}

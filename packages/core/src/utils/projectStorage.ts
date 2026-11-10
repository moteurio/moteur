import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { projectDir } from './pathUtils.js';
import { writeFileAtomicAsync, writeJsonAtomicAsync } from './fileUtils.js';
import { readTextCached } from './fileCache.js';
import { reachesSites, touchProject } from '../deliveryCache.js';
import { getContentIndex, parseEntryKey } from '../contentIndex/index.js';
import type { Entry } from '@moteurio/types/Model.js';
import { isValidId } from './idUtils.js';
import {
    mergeProjectSecrets,
    readProjectSecrets,
    splitProjectSecrets,
    writeProjectSecrets
} from './projectSecrets.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';

/** The project file. Its credentials are stored separately in the secrets file (see projectSecrets.ts). */
const PROJECT_FILE = 'project.json';

function fullPath(projectId: string, key: string): string {
    if (!isValidId(projectId))
        throw Object.assign(new Error('Invalid project ID'), { status: 400 });
    const root = path.resolve(projectDir(projectId));
    const target = path.resolve(root, key);
    const relative = path.relative(root, target);
    if (
        path.isAbsolute(key) ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw Object.assign(new Error('Invalid project storage key'), { status: 400 });
    }
    return target;
}

/**
 * Updates the content index after an entry file changes. The file is already written, so an index
 * failure must not fail the operation. The index re-checks the files on its next query instead.
 */
async function updateContentIndex(projectId: string, key: string, data?: unknown): Promise<void> {
    const ids = parseEntryKey(key);
    if (!ids) return;
    const index = await getContentIndex();
    try {
        if (data === undefined) await index.entryRemoved(projectId, ids.modelId, ids.entryId);
        else await index.entryWritten(projectId, ids.modelId, ids.entryId, data as Entry);
    } catch (err) {
        console.warn(
            `[Moteur] Content index update failed for "${key}" in project "${projectId}":`,
            err instanceof Error ? err.message : err
        );
        index.invalidate(projectId);
    }
}

/**
 * Returns a project file's raw text from the file cache, or null if the file does not exist. Use
 * it when you want to cache a parsed result and reuse it for as long as the text is unchanged.
 */
export async function getProjectText(projectId: string, key: string): Promise<string | null> {
    try {
        return await readTextCached(fullPath(projectId, key));
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw err;
    }
}

export async function getProjectJson<T = unknown>(
    projectId: string,
    key: string
): Promise<T | null> {
    try {
        const data = await readTextCached(fullPath(projectId, key));
        const parsed = JSON.parse(data) as T;
        if (key !== PROJECT_FILE || !parsed) return parsed;
        return mergeProjectSecrets(
            parsed as Partial<ProjectSchema>,
            readProjectSecrets(projectDir(projectId))
        ) as T;
    } catch (err: unknown) {
        const code =
            err && typeof err === 'object' && 'code' in err
                ? (err as NodeJS.ErrnoException).code
                : undefined;
        if (code === 'ENOENT') return null;
        throw err;
    }
}

export async function putProjectJson(projectId: string, key: string, data: unknown): Promise<void> {
    const fullPath_ = fullPath(projectId, key);
    await fs.mkdir(path.dirname(fullPath_), { recursive: true });
    if (key === PROJECT_FILE && data && typeof data === 'object') {
        // Write the secrets first. If the second write fails, project.json still contains them.
        const { project, secrets } = splitProjectSecrets(data as Partial<ProjectSchema>);
        writeProjectSecrets(projectDir(projectId), secrets);
        await writeJsonAtomicAsync(fullPath_, project);
        if (reachesSites(key)) touchProject(projectId);
        return;
    }
    await writeJsonAtomicAsync(fullPath_, data);
    if (reachesSites(key)) touchProject(projectId);
    await updateContentIndex(projectId, key, data);
}

export async function hasProjectKey(projectId: string, key: string): Promise<boolean> {
    try {
        await fs.access(fullPath(projectId, key), fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

export async function deleteProjectKey(projectId: string, key: string): Promise<void> {
    try {
        await fs.unlink(fullPath(projectId, key));
    } catch (err: unknown) {
        const code =
            err && typeof err === 'object' && 'code' in err
                ? (err as NodeJS.ErrnoException).code
                : undefined;
        if (code !== 'ENOENT') throw err;
    }
    if (reachesSites(key)) touchProject(projectId);
    await updateContentIndex(projectId, key);
}

/**
 * Lists the keys under a prefix. It lists a directory, or the keys of a single JSON file when the
 * prefix points to a .json file.
 */
export async function listProjectKeys(projectId: string, prefix?: string): Promise<string[]> {
    const basePath = fullPath(projectId, prefix ?? '');
    const possibleFile = basePath.endsWith('.json')
        ? basePath
        : fullPath(projectId, `${prefix ?? ''}.json`);

    let useFileMode = false;
    try {
        await fs.access(possibleFile, fsConstants.F_OK);
        useFileMode = true;
    } catch {
        // not a single file
    }

    if (useFileMode) {
        try {
            const data = await readTextCached(possibleFile);
            const json = JSON.parse(data);
            if (Array.isArray(json)) return json.map((_, idx) => `${idx}`);
            if (json && typeof json === 'object') return Object.keys(json);
            return [];
        } catch (err: unknown) {
            const code =
                err && typeof err === 'object' && 'code' in err
                    ? (err as NodeJS.ErrnoException).code
                    : undefined;
            if (code === 'ENOENT') return [];
            throw err;
        }
    }

    try {
        const entries = await fs.readdir(basePath, { withFileTypes: true });
        return entries
            .filter(e => e.isDirectory() || (e.isFile() && e.name.endsWith('.json')))
            .map(e => e.name);
    } catch (err: unknown) {
        const code =
            err && typeof err === 'object' && 'code' in err
                ? (err as NodeJS.ErrnoException).code
                : undefined;
        if (code === 'ENOENT') return [];
        throw err;
    }
}

/**
 * Restores a file to its previous exact text, or removes it when `text` is null. This undoes a
 * change. The content index is updated to match.
 */
export async function restoreProjectFile(
    projectId: string,
    key: string,
    text: string | null
): Promise<void> {
    const target = fullPath(projectId, key);
    if (text === null) {
        await fs.rm(target, { force: true });
        // Also remove folders left empty, such as an entry's folder, because entries and models are listed by their folders.
        const root = fullPath(projectId, '');
        for (
            let dir = path.dirname(target);
            dir.startsWith(root + path.sep);
            dir = path.dirname(dir)
        )
            if (
                !(await fs.rmdir(dir).then(
                    () => true,
                    () => false
                ))
            )
                break;
        if (reachesSites(key)) touchProject(projectId);
        await updateContentIndex(projectId, key);
        return;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await writeFileAtomicAsync(target, text);
    if (reachesSites(key)) touchProject(projectId);
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        data = undefined;
    }
    if (data !== undefined) await updateContentIndex(projectId, key, data);
}

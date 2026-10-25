import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { projectDir } from './pathUtils.js';
import { writeJsonAtomicAsync } from './fileUtils.js';
import { getContentIndex, parseEntryKey } from '../contentIndex/index.js';
import type { Entry } from '@moteurio/types/Model.js';
import { isValidId } from './idUtils.js';

const ENCODING = 'utf-8';

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
 * Keep the content index in step with entry files. The file is already written, so an index
 * failure must not fail the operation: the index re-checks files on its next query instead.
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

export async function getProjectJson<T = unknown>(
    projectId: string,
    key: string
): Promise<T | null> {
    try {
        const data = await fs.readFile(fullPath(projectId, key), ENCODING);
        return JSON.parse(data) as T;
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
    await writeJsonAtomicAsync(fullPath_, data);
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
    await updateContentIndex(projectId, key);
}

/**
 * List keys under prefix. Uses directory listing, or single-file JSON keys when prefix points to a .json file.
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
            const data = await fs.readFile(possibleFile, ENCODING);
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

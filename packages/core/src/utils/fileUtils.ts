import { randomUUID } from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import {
    projectDir,
    //trashProjectDir,
    projectFilePath,
    modelDir,
    //trashModelDir,
    modelFilePath,
    entryDir,
    //trashEntryDir,
    entryFilePath,
    layoutDir,
    //trashLayoutDir,
    layoutFilePath,
    structureDir,
    //trashStructureDir,
    structureFilePath
} from './pathUtils.js';

export function readJson(file: string): any {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
}

export function writeJson(file: string, data: any): void {
    writeFileAtomicSync(file, JSON.stringify(data, null, 2));
}

/**
 * Write a whole file or nothing: to a temporary file beside it, then renamed over it. A write cut
 * short (a full disk, a crash) leaves the file as it was, never half written, and the temporary
 * file goes. `mode` for files only their owner may read (secrets).
 */
export function writeFileAtomicSync(file: string, data: string | Buffer, mode?: number): void {
    const tmp = tempPathFor(path.dirname(file), path.basename(file));
    try {
        fs.writeFileSync(tmp, data, mode === undefined ? undefined : { mode });
        fs.renameSync(tmp, file);
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

/** `writeFileAtomicSync`, without blocking: for project storage. */
export async function writeFileAtomicAsync(file: string, data: string | Buffer): Promise<void> {
    const tmp = tempPathFor(path.dirname(file), path.basename(file));
    try {
        await fsp.writeFile(tmp, data);
        await fsp.rename(tmp, file);
    } finally {
        await fsp.rm(tmp, { force: true });
    }
}

/**
 * Atomic write for JSON: write to a temp file then rename.
 * Reduces risk of corruption if the process crashes during write.
 * Use for critical single-file data (e.g. users.json).
 * Note: No cross-process locking; avoid concurrent writes to the same file from multiple processes.
 */
/**
 * A temp file unique to this write. With a shared name, two concurrent writes to the same file
 * write into the same temp file and one can rename the other's half-written data into place.
 */
function tempPathFor(dir: string, name: string): string {
    return path.join(dir, `.${name}.${process.pid}.${randomUUID()}.tmp`);
}

export function writeJsonAtomic(file: string, data: any): void {
    writeFileAtomicSync(file, JSON.stringify(data, null, 2));
}

/** Async atomic write for JSON: write to temp file then rename. Use for project storage. */
export async function writeJsonAtomicAsync(file: string, data: unknown): Promise<void> {
    await writeFileAtomicAsync(file, JSON.stringify(data, null, 2));
}

/** Check if a project exists (directory) */
export function isExistingProjectId(projectId: string): boolean {
    return fs.existsSync(projectDir(projectId));
}

/** Check if a project definition file exists */
export function isExistingProjectSchema(projectId: string): boolean {
    return fs.existsSync(projectFilePath(projectId));
}

/** Check if a model exists (directory) */
export function isExistingModelId(projectId: string, modelId: string): boolean {
    return fs.existsSync(modelDir(projectId, modelId));
}

/** Check if a model definition file exists */
export function isExistingModelSchema(projectId: string, modelId: string): boolean {
    return fs.existsSync(modelFilePath(projectId, modelId));
}

/** Check if an entry exists (directory) */
export function isExistingEntryId(projectId: string, modelId: string, entryId: string): boolean {
    return fs.existsSync(entryDir(projectId, modelId, entryId));
}

/** Check if an entry definition file exists */
export function isExistingEntrySchema(
    projectId: string,
    modelId: string,
    entryId: string
): boolean {
    return fs.existsSync(entryFilePath(projectId, modelId, entryId));
}

/** Check if a layout exists (directory) */
export function isExistingLayoutId(projectId: string, layoutId: string): boolean {
    return fs.existsSync(layoutDir(projectId, layoutId));
}

/** Check if a layout definition file exists */
export function isExistingLayoutSchema(projectId: string, layoutId: string): boolean {
    return fs.existsSync(layoutFilePath(projectId, layoutId));
}

/** Check if a structure exists (directory) */
export function isExistingStructureId(projectId: string, structureId: string): boolean {
    return fs.existsSync(structureDir(projectId, structureId));
}

/** Check if a structure definition file exists */
export function isExistingStructureSchema(projectId: string, structureId: string): boolean {
    return fs.existsSync(structureFilePath(projectId, structureId));
}

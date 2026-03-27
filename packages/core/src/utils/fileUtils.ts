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
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Atomic write for JSON: write to a temp file then rename.
 * Reduces risk of corruption if the process crashes during write.
 * Use for critical single-file data (e.g. users.json).
 * Note: No cross-process locking; avoid concurrent writes to the same file from multiple processes.
 */
export function writeJsonAtomic(file: string, data: any): void {
    const dir = path.dirname(file);
    const name = path.basename(file);
    const tmp = path.join(dir, `.${name}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
}

/** Async atomic write for JSON: write to temp file then rename. Use for project storage. */
export async function writeJsonAtomicAsync(file: string, data: unknown): Promise<void> {
    const dir = path.dirname(file);
    const name = path.basename(file);
    const tmp = path.join(dir, `.${name}.tmp`);
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fsp.rename(tmp, file);
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

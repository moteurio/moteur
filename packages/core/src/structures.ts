import fs from 'fs';
import path from 'path';
import { StructureSchema } from '@moteurio/types/Structure.js';
import type { User } from '@moteurio/types/User.js';
import { validateStructure } from './validators/validateStructure.js';
import { normalizeType } from './utils/normalizeType.js';
import { isValidId } from './utils/idUtils.js';
import { baseProjectsDir } from './utils/pathUtils.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { structureKey, structureListPrefix } from './utils/storageKeys.js';
import { triggerEvent } from './utils/eventBus.js';

function systemUser(): User {
    return { id: 'system', name: 'System', isActive: true, email: '', roles: [], projects: [] };
}

function loadFromDir(dirPath: string, registry: Record<string, StructureSchema>): void {
    if (!fs.existsSync(dirPath)) return;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('on'));

    for (const file of files) {
        try {
            const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
            const schema = JSON.parse(raw) as StructureSchema;

            if (!schema.type) {
                console.warn(`[Moteur] Skipping invalid structure: ${file}`);
                continue;
            }

            registry[normalizeType(schema.type)] = schema;
        } catch (err) {
            console.error(`[Moteur] Failed to load structure ${file}`, err);
        }
    }
}

/** List all structures for a given project (including global fallbacks) */
export async function listStructures(project?: string): Promise<Record<string, StructureSchema>> {
    const registry: Record<string, StructureSchema> = {};

    for (const ns of ['core']) {
        const nsDir = path.resolve('structures', ns);
        loadFromDir(nsDir, registry);
    }

    if (project) {
        const ids = await listProjectKeys(project, structureListPrefix());
        for (const id of ids) {
            const schema = await getProjectJson<StructureSchema>(project, structureKey(id));
            if (schema?.type) {
                registry[normalizeType(schema.type)] = schema;
            }
        }
    }

    return registry;
}

/** Sync: get a structure from core namespace only. Used by validators. */
export function getStructureFromCore(id: string): StructureSchema {
    const type = id.endsWith('.json') ? id.replace(/\.json$/, '') : id;
    const normalized = normalizeType(type);
    const registry: Record<string, StructureSchema> = {};
    loadFromDir(path.resolve('structures', 'core'), registry);
    const resolved = registry[normalized];
    if (!resolved) {
        throw new Error(`Structure "${id}" not found in core`);
    }
    return resolved;
}

/** Get a specific structure (project takes priority if provided) */
export async function getStructure(id: string, project?: string): Promise<StructureSchema> {
    if (!isValidId(id)) {
        throw new Error(`Invalid structureId: "${id}"`);
    }
    if (project && !isValidId(project)) {
        throw new Error(`Invalid projectId: "${project}"`);
    }
    const type = id.endsWith('.json') ? id.replace(/\.json$/, '') : id;
    const all = await listStructures(project);
    const resolved = all[type];
    if (!resolved) {
        throw new Error(`Structure "${id}" not found`);
    }
    return resolved;
}

/** Create a new structure in a given project */
export async function createStructure(
    project: string,
    schema: StructureSchema,
    user?: User
): Promise<StructureSchema> {
    if (!isValidId(project)) {
        throw new Error(`Invalid projectId: "${project}"`);
    }

    const validationResult = validateStructure(schema);
    if (validationResult.issues.length > 0) {
        const errorMessages = validationResult.issues
            .map(issue => `${issue.path}: ${issue.message}`)
            .join(', ');
        throw new Error(`Structure validation failed: ${errorMessages}`);
    }

    const exists = await hasProjectKey(project, structureKey(schema.type));
    if (exists) {
        throw new Error(`Structure "${schema.type}" already exists`);
    }

    const u = user ?? systemUser();
    triggerEvent('structure.beforeCreate', { structure: schema, user: u, projectId: project });
    await putProjectJson(project, structureKey(schema.type), schema);
    triggerEvent('content.saved', {
        projectId: project,
        paths: [structureKey(schema.type)],
        message: `Create structure ${schema.type} — ${u.name ?? u.id}`,
        user: u
    });
    triggerEvent('structure.afterCreate', { structure: schema, user: u, projectId: project });
    return schema;
}

/** Update a structure in a project (only project scope is writable) */
export async function updateStructure(
    project: string,
    id: string,
    patch: Partial<StructureSchema>,
    user?: User
): Promise<StructureSchema> {
    if (!isValidId(project)) {
        throw new Error(`Invalid projectId: "${project}"`);
    }
    if (!isValidId(id)) {
        throw new Error(`Invalid structureId: "${id}"`);
    }

    const current = await getProjectJson<StructureSchema>(project, structureKey(id));
    if (!current) {
        throw new Error(`Structure ${id} not found in project ${project}`);
    }
    const updated = { ...current, ...patch };

    const validationResult = validateStructure(updated);
    if (validationResult.issues.length > 0) {
        const errorMessages = validationResult.issues
            .map(issue => `${issue.path}: ${issue.message}`)
            .join(', ');
        throw new Error(`Structure validation failed: ${errorMessages}`);
    }

    const u = user ?? systemUser();
    triggerEvent('structure.beforeUpdate', { structure: updated, user: u, projectId: project });
    await putProjectJson(project, structureKey(id), updated);
    triggerEvent('content.saved', {
        projectId: project,
        paths: [structureKey(id)],
        message: `Update structure ${id} — ${u.name ?? u.id}`,
        user: u
    });
    triggerEvent('structure.afterUpdate', { structure: updated, user: u, projectId: project });
    return updated;
}

/** Soft-delete (trash) a structure in a project */
export async function deleteStructure(project: string, id: string, user?: User): Promise<void> {
    if (!isValidId(project)) {
        throw new Error(`Invalid projectId: "${project}"`);
    }
    if (!isValidId(id)) {
        throw new Error(`Invalid structureId: "${id}"`);
    }
    const current = await getProjectJson<StructureSchema>(project, structureKey(id));
    if (!current) {
        throw new Error(`Structure ${id} not found in project ${project}`);
    }

    const u = user ?? systemUser();
    triggerEvent('structure.beforeDelete', { structure: current, user: u, projectId: project });

    const base = baseProjectsDir();
    const source = path.join(base, project, 'structures', id, 'structure.json');
    const trashDir = path.join(base, project, '.trash', 'structures');
    const dest = path.join(trashDir, `${id}.json`);

    fs.mkdirSync(trashDir, { recursive: true });
    fs.renameSync(source, dest);

    triggerEvent('content.deleted', {
        projectId: project,
        paths: [structureKey(id)],
        message: `Delete structure ${id} — ${u.name ?? u.id}`,
        user: u
    });
    triggerEvent('structure.afterDelete', { structure: current, user: u, projectId: project });
}

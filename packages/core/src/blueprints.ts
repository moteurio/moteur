import fs from 'fs';
import path from 'path';
import type { BlueprintKind, BlueprintSchema } from '@moteurio/types/Blueprint.js';
import type { User } from '@moteurio/types/User.js';
import { isValidId } from './utils/idUtils.js';
import { storageConfig } from './config/storageConfig.js';
import { writeJson } from './utils/fileUtils.js';
import { triggerEvent } from './utils/eventBus.js';
import { validateModel } from './validators/validateModel.js';
import { validateStructure } from './validators/validateStructure.js';
import { validateTemplate } from './validators/validateTemplate.js';

const BLUEPRINT_KINDS: BlueprintKind[] = ['project', 'model', 'structure', 'template'];

/** In-memory blueprints registered by plugins (e.g. default core blueprints). Merged with file-based. */
const pluginBlueprintRegistry: Partial<Record<BlueprintKind, Map<string, BlueprintSchema>>> = {};

/**
 * Register a blueprint from a plugin. Used by the default core-blueprints plugin when enabled.
 */
export function registerBlueprint(blueprint: BlueprintSchema): void {
    const kind = effectiveKind(blueprint);
    if (!blueprint.id || !isValidId(blueprint.id)) return;
    if (!pluginBlueprintRegistry[kind]) pluginBlueprintRegistry[kind] = new Map();
    pluginBlueprintRegistry[kind]!.set(blueprint.id, { ...blueprint, id: blueprint.id, kind });
}

function systemUser(): User {
    return { id: 'system', name: 'System', isActive: true, email: '', roles: [], projects: [] };
}

function kindSubdir(kind: BlueprintKind): string {
    return path.join(storageConfig.blueprintsDir, kind);
}

function blueprintFilePath(kind: BlueprintKind, id: string): string {
    return path.join(kindSubdir(kind), `${id}.json`);
}

function effectiveKind(b: BlueprintSchema): BlueprintKind {
    const k = b.kind;
    return k && BLUEPRINT_KINDS.includes(k) ? k : 'project';
}

/**
 * One-time migration: move root-level .json files to data/blueprints/projects/.
 * Idempotent: if root has no .json files, no-op. Call before any read when using subdir layout.
 */
function migrateBlueprintsToSubdirs(): void {
    const dir = storageConfig.blueprintsDir;
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const rootJsonFiles = entries.filter(e => e.isFile() && e.name.endsWith('.json'));
    if (rootJsonFiles.length === 0) return;

    const projectsDir = kindSubdir('project');
    if (!fs.existsSync(projectsDir)) {
        fs.mkdirSync(projectsDir, { recursive: true });
    }

    for (const e of rootJsonFiles) {
        const src = path.join(dir, e.name);
        const dest = path.join(projectsDir, e.name);
        try {
            fs.renameSync(src, dest);
        } catch (err) {
            console.error(`[Moteur] Failed to migrate blueprint ${e.name}`, err);
        }
    }

    // Ensure all kind subdirs exist
    for (const k of BLUEPRINT_KINDS) {
        const subdir = kindSubdir(k);
        if (!fs.existsSync(subdir)) {
            fs.mkdirSync(subdir, { recursive: true });
        }
    }
}

/**
 * List all blueprints of a given kind.
 * @param kind - Required. One of 'project', 'model', 'structure', 'template'.
 */
export function listBlueprints(kind: BlueprintKind): BlueprintSchema[] {
    migrateBlueprintsToSubdirs();

    const byId = new Map<string, BlueprintSchema>();

    const dir = kindSubdir(kind);
    if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
            const id = f.replace(/\.json$/, '');
            try {
                const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
                const schema = JSON.parse(raw) as BlueprintSchema;
                byId.set(id, { ...schema, id, kind });
            } catch (err) {
                console.error(`[Moteur] Failed to load blueprint "${kind}/${id}"`, err);
            }
        }
    }

    const pluginMap = pluginBlueprintRegistry[kind];
    if (pluginMap) {
        for (const [id, schema] of pluginMap) {
            byId.set(id, schema);
        }
    }
    return Array.from(byId.values());
}

/**
 * Get a single blueprint by kind and id.
 * @param kind - Required. One of 'project', 'model', 'structure', 'template'.
 * @param id - Blueprint id (unique within that kind).
 */
export function getBlueprint(kind: BlueprintKind, id: string): BlueprintSchema {
    if (!isValidId(id)) {
        throw new Error(`Invalid blueprint id: "${id}"`);
    }
    const pluginMap = pluginBlueprintRegistry[kind];
    const fromPlugin = pluginMap?.get(id);
    if (fromPlugin) return fromPlugin;

    migrateBlueprintsToSubdirs();
    const filePath = blueprintFilePath(kind, id);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Blueprint "${kind}/${id}" not found`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const schema = JSON.parse(raw) as BlueprintSchema;
    return { ...schema, id, kind } as BlueprintSchema;
}

function validateBlueprintPayload(blueprint: BlueprintSchema): void {
    const k = effectiveKind(blueprint);
    if (k === 'model') {
        const t = blueprint.template as { model?: unknown } | undefined;
        if (!t?.model) {
            throw new Error('Blueprint kind "model" requires template.model');
        }
        const modelResult = validateModel(t.model as Parameters<typeof validateModel>[0]);
        if (modelResult.issues.length > 0) {
            const msg = modelResult.issues.map(i => `${i.path}: ${i.message}`).join('; ');
            throw new Error(`Blueprint template.model validation failed: ${msg}`);
        }
    } else if (k === 'structure') {
        const t = blueprint.template as { structure?: unknown } | undefined;
        if (!t?.structure) {
            throw new Error('Blueprint kind "structure" requires template.structure');
        }
        const structResult = validateStructure(
            t.structure as Parameters<typeof validateStructure>[0]
        );
        if (structResult.issues.some(i => i.type === 'error')) {
            const msg = structResult.issues
                .filter(i => i.type === 'error')
                .map(i => `${i.path}: ${i.message}`)
                .join('; ');
            throw new Error(`Blueprint template.structure validation failed: ${msg}`);
        }
    } else if (k === 'template') {
        const t = blueprint.template as
            | { template?: { id?: string; label?: string; description?: string; fields?: unknown } }
            | undefined;
        if (!t?.template) {
            throw new Error('Blueprint kind "template" requires template.template');
        }
        const templateForValidation = {
            ...t.template,
            id: t.template.id ?? 'placeholder',
            projectId: 'placeholder'
        };
        const templateResult = validateTemplate(
            templateForValidation as Parameters<typeof validateTemplate>[0]
        );
        if (templateResult.issues.some(i => i.type === 'error')) {
            const msg = templateResult.issues
                .filter(i => i.type === 'error')
                .map(i => `${i.path}: ${i.message}`)
                .join('; ');
            throw new Error(`Blueprint template.template validation failed: ${msg}`);
        }
    }
}

/**
 * Create or overwrite a blueprint. File is written to blueprintsDir/&lt;kind&gt;/&lt;id&gt;.json.
 * Kind is derived from blueprint.kind (default 'project').
 */
export function createBlueprint(blueprint: BlueprintSchema, performedBy?: User): BlueprintSchema {
    if (!blueprint?.id || !isValidId(blueprint.id)) {
        throw new Error(`Invalid blueprint id: "${blueprint?.id}"`);
    }
    const kind = effectiveKind(blueprint);
    validateBlueprintPayload(blueprint);

    migrateBlueprintsToSubdirs();
    const dir = kindSubdir(kind);
    fs.mkdirSync(dir, { recursive: true });

    const payload = { ...blueprint, id: blueprint.id, kind };
    writeJson(blueprintFilePath(kind, blueprint.id), payload);
    triggerEvent('blueprint.afterCreate', {
        blueprint: payload,
        user: performedBy ?? systemUser()
    });
    return payload;
}

/**
 * Update an existing blueprint (partial patch). Fails if the blueprint does not exist.
 */
export function updateBlueprint(
    kind: BlueprintKind,
    id: string,
    patch: Partial<Omit<BlueprintSchema, 'id'>>,
    performedBy?: User
): BlueprintSchema {
    const current = getBlueprint(kind, id);
    const updated: BlueprintSchema = { ...current, ...patch, id, kind };
    validateBlueprintPayload(updated);
    writeJson(blueprintFilePath(kind, id), updated);
    triggerEvent('blueprint.afterUpdate', {
        blueprint: updated,
        user: performedBy ?? systemUser()
    });
    return updated;
}

/**
 * Delete a blueprint file. No-op if the file does not exist.
 */
export function deleteBlueprint(kind: BlueprintKind, id: string, performedBy?: User): void {
    if (!isValidId(id)) {
        throw new Error(`Invalid blueprint id: "${id}"`);
    }
    migrateBlueprintsToSubdirs();
    const filePath = blueprintFilePath(kind, id);
    if (fs.existsSync(filePath)) {
        const current = getBlueprint(kind, id);
        fs.unlinkSync(filePath);
        triggerEvent('blueprint.afterDelete', {
            blueprint: current,
            user: performedBy ?? systemUser()
        });
    }
}

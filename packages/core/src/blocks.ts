import fs from 'fs';
import path from 'path';
import { BlockSchema } from '@moteurio/types/Block.js';
import { storageConfig } from './config/storageConfig.js';
import { isValidId } from './utils/idUtils.js';
import { isExistingProjectId, writeJson } from './utils/fileUtils.js';
import { normalizeType } from './utils/normalizeType.js';

const isTestEnv = (): boolean => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/** In-memory block schemas registered by plugins (e.g. default core blocks). Merged on top of file-based blocks. */
const pluginBlockRegistry: Record<string, BlockSchema> = {};

/**
 * Register a block schema from a plugin. Overlays file-based blocks; same type overwrites.
 * Used by the default core-blocks plugin to provide built-in block types when enabled.
 */
export function registerBlockSchema(schema: BlockSchema): void {
    if (!schema?.type) return;
    const key = schema.type.includes('/') ? schema.type : `core/${schema.type}`;
    pluginBlockRegistry[key] = schema;
}

function loadBlocksFromDir(
    root: string,
    namespace: string,
    registry: Record<string, BlockSchema>,
    isTestEnv: boolean
): void {
    if (!fs.existsSync(root)) return;
    try {
        const files = fs.readdirSync(root).filter(file => file.endsWith('.json'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(root, file), 'utf-8');
                const schema = JSON.parse(content) as BlockSchema;
                if (!schema || !schema.type) {
                    if (!isTestEnv)
                        console.warn(`Invalid schema in file: ${file} - ${schema?.type}`);
                    continue;
                }
                const key = schema.type.includes('/')
                    ? schema.type
                    : `${namespace}/${normalizeType(schema.type)}`;
                registry[key] = schema;
            } catch (err) {
                if (!isTestEnv) console.error(`Failed to process file: ${file}`, err);
            }
        }
    } catch (err) {
        if (!isTestEnv) console.error(`Failed to load blocks from namespace: ${namespace}`, err);
    }
}

export function listBlocks(projectId?: string): Record<string, BlockSchema> {
    const registry: Record<string, BlockSchema> = {};
    const testEnv = isTestEnv();

    if (!testEnv) {
        console.log(`Loading blocks for project: ${projectId || 'all'}`);
    }

    // 1. Core blocks: data/core/blocks
    const coreRoot = path.join(storageConfig.dataRoot, 'data', 'core', 'blocks');
    loadBlocksFromDir(coreRoot, 'core', registry, testEnv);

    // 2. Project-scoped blocks: data/projects/<projectId>/blocks (e.g. demo blocks)
    if (projectId && isExistingProjectId(projectId)) {
        const projectBlocksRoot = path.join(storageConfig.projectsDir, projectId, 'blocks');
        loadBlocksFromDir(projectBlocksRoot, projectId, registry, testEnv);
    }

    // Plugin-registered blocks overlay (e.g. core-blocks plugin)
    for (const [key, schema] of Object.entries(pluginBlockRegistry)) {
        registry[key] = schema;
    }
    return registry;
}

export function getBlock(type: string, project?: string): BlockSchema {
    if (project && !isValidId(project)) {
        throw new Error(`Invalid project ID: ${project}`);
    }
    if (project && !isExistingProjectId(project as string)) {
        throw new Error(`Project "${project}" does not exist`);
    }
    const blocks = listBlocks(project);
    if (!blocks[type]) {
        throw new Error(`Block type "${type}" not found`);
    }
    return blocks[type];
}

/**
 * Create a global block type under `data/core/blocks` (operator-only at HTTP layer).
 * Prefer {@link createProjectBlock} for tenant-specific definitions.
 */
export function createBlock(schema: BlockSchema): BlockSchema {
    if (!schema || !schema.type) {
        throw new Error('Block schema must have a "type" field');
    }
    const namespace = 'core';
    const slug = schema.type.includes('/') ? schema.type.split('/')[1] : schema.type;
    const safeSlug = slug.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || 'block';
    const normalizedType = `${namespace}/${safeSlug}`;
    const root = path.join(storageConfig.dataRoot, 'data', namespace, 'blocks');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    const filePath = path.join(root, `${safeSlug}.json`);
    if (fs.existsSync(filePath)) {
        throw new Error(`Block type "${normalizedType}" already exists`);
    }
    const toWrite = {
        type: normalizedType,
        label: schema.label ?? safeSlug.charAt(0).toUpperCase() + safeSlug.slice(1),
        description: schema.description,
        category: schema.category,
        fields: schema.fields ?? {},
        optionsSchema: schema.optionsSchema,
        ...(schema.variantHints != null && { variantHints: schema.variantHints }),
        ...(schema.editorial != null && { editorial: schema.editorial })
    };
    fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 4), 'utf-8');
    return toWrite as BlockSchema;
}

function projectBlocksDir(projectId: string): string {
    return path.join(storageConfig.projectsDir, projectId, 'blocks');
}

function projectBlockFilePath(projectId: string, slug: string): string {
    return path.join(projectBlocksDir(projectId), `${slug}.json`);
}

/**
 * Parse route/query `id` for project block APIs: short `slug` or `{projectId}/{slug}` (encoded as one segment).
 */
export function parseProjectBlockIdParam(projectId: string, param: string): string {
    const decoded = decodeURIComponent(param).trim();
    if (!decoded) {
        throw new Error('Empty block id');
    }
    let slug = decoded;
    if (decoded.includes('/')) {
        const prefix = `${projectId}/`;
        if (!decoded.startsWith(prefix)) {
            throw new Error(`Block id must be a slug or "${projectId}/<slug>"`);
        }
        slug = decoded.slice(prefix.length);
    }
    if (!slug || slug.includes('/') || slug.includes('..')) {
        throw new Error('Invalid block slug');
    }
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
        throw new Error('Invalid block slug');
    }
    return slug;
}

function slugForNewProjectBlock(projectId: string, typeField: string): string {
    const t = typeField.trim();
    if (!t) {
        throw new Error('Block schema must have a "type" field');
    }
    if (t.includes('/')) {
        const idx = t.indexOf('/');
        const ns = t.slice(0, idx);
        const rest = t.slice(idx + 1).trim();
        if (ns !== projectId) {
            throw new Error(`Project block type namespace must be "${projectId}"`);
        }
        if (!rest) {
            throw new Error('Invalid block type');
        }
        return rest.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || 'block';
    }
    return t.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || 'block';
}

function blockPayloadFromInput(
    normalizedType: string,
    slug: string,
    schema: BlockSchema
): BlockSchema {
    return {
        type: normalizedType,
        label: schema.label ?? slug.charAt(0).toUpperCase() + slug.slice(1),
        description: schema.description,
        category: schema.category,
        fields: schema.fields ?? {},
        optionsSchema: schema.optionsSchema,
        ...(schema.variantHints != null && { variantHints: schema.variantHints }),
        ...(schema.editorial != null && { editorial: schema.editorial })
    } as BlockSchema;
}

/**
 * Create a project-scoped block under `data/projects/<projectId>/blocks/<slug>.json`.
 * `schema.type` may be a short name or `{projectId}/<slug>`.
 */
export function createProjectBlock(projectId: string, schema: BlockSchema): BlockSchema {
    if (!isValidId(projectId) || !isExistingProjectId(projectId)) {
        throw new Error(`Project "${projectId}" does not exist`);
    }
    if (!schema?.type) {
        throw new Error('Block schema must have a "type" field');
    }
    const safeSlug = slugForNewProjectBlock(projectId, schema.type);
    const normalizedType = `${projectId}/${safeSlug}`;
    const dir = projectBlocksDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = projectBlockFilePath(projectId, safeSlug);
    if (fs.existsSync(filePath)) {
        throw new Error(`Block type "${normalizedType}" already exists in this project`);
    }
    const toWrite = blockPayloadFromInput(normalizedType, safeSlug, schema);
    writeJson(filePath, toWrite);
    return toWrite;
}

/**
 * Replace or patch a project block JSON file. Fails if only a core/plugin block exists (no project file).
 */
export function updateProjectBlock(
    projectId: string,
    slugParam: string,
    patch: Partial<BlockSchema>,
    mode: 'merge' | 'replace'
): BlockSchema {
    if (!isValidId(projectId) || !isExistingProjectId(projectId)) {
        throw new Error(`Project "${projectId}" does not exist`);
    }
    const slug = parseProjectBlockIdParam(projectId, slugParam);
    const filePath = projectBlockFilePath(projectId, slug);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Project block "${projectId}/${slug}" not found (built-in core/* types cannot be updated here)`
        );
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const current = JSON.parse(raw) as BlockSchema;
    const normalizedType = `${projectId}/${slug}`;

    const next: BlockSchema =
        mode === 'replace'
            ? blockPayloadFromInput(normalizedType, slug, {
                  ...current,
                  ...patch,
                  type: normalizedType
              } as BlockSchema)
            : ({
                  ...current,
                  ...patch,
                  type: normalizedType
              } as BlockSchema);

    writeJson(filePath, next);
    return next;
}

/** Delete a project block file. Does not remove core/plugin definitions. */
export function deleteProjectBlock(projectId: string, slugParam: string): void {
    if (!isValidId(projectId) || !isExistingProjectId(projectId)) {
        throw new Error(`Project "${projectId}" does not exist`);
    }
    const slug = parseProjectBlockIdParam(projectId, slugParam);
    const filePath = projectBlockFilePath(projectId, slug);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Project block "${projectId}/${slug}" not found (built-in types are not deleted here)`
        );
    }
    fs.unlinkSync(filePath);
}

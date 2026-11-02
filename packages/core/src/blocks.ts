import fs from 'fs';
import path from 'path';
import { BlockSchema } from '@moteurio/types/Block.js';
import { storageConfig } from './config/storageConfig.js';
import { isValidId } from './utils/idUtils.js';
import { isExistingProjectId, writeJson, writeFileAtomicSync } from './utils/fileUtils.js';
import { normalizeType } from './utils/normalizeType.js';
import { builtinBlockSchemas } from './plugins/builtinContent.js';
import { readTextCachedSync } from './utils/fileCache.js';
import { assertCountRoom, getCountLimit } from './planLimits.js';
import { assertFieldDefinitions } from './validators/fieldDefinitions.js';

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

for (const schema of builtinBlockSchemas) registerBlockSchema(schema);

/** Blocks that ship with the engine or a plugin, before any file in data/core overrides them. */
export function shippedBlockSchemas(): Record<string, BlockSchema> {
    return { ...pluginBlockRegistry };
}

/**
 * Blocks in a folder. The server's (data/core) are named `core/<name>`; a project's own are named
 * without a namespace (`hero`): a name with a slash is the server's, one without is the project's.
 */
function loadBlocksFromDir(
    root: string,
    namespace: string | null,
    registry: Record<string, BlockSchema>,
    isTestEnv: boolean
): void {
    if (!fs.existsSync(root)) return;
    try {
        const files = fs.readdirSync(root).filter(file => file.endsWith('.json'));
        for (const file of files) {
            try {
                const content = readTextCachedSync(path.join(root, file));
                const schema = JSON.parse(content) as BlockSchema;
                if (!schema || !schema.type) {
                    if (!isTestEnv)
                        console.warn(`Invalid schema in file: ${file} - ${schema?.type}`);
                    continue;
                }
                const key =
                    namespace === null || schema.type.includes('/')
                        ? schema.type
                        : `${namespace}/${normalizeType(schema.type)}`;
                registry[key] = schema;
            } catch (err) {
                if (!isTestEnv) console.error(`Failed to process file: ${file}`, err);
            }
        }
    } catch (err) {
        if (!isTestEnv) console.error(`Failed to load blocks from ${root}`, err);
    }
}

export function listBlocks(projectId?: string): Record<string, BlockSchema> {
    const registry: Record<string, BlockSchema> = {};
    const testEnv = isTestEnv();

    // Shipped blocks first. A file in data/core, then a project block, overrides the same type.
    Object.assign(registry, pluginBlockRegistry);
    const coreRoot = path.join(storageConfig.dataRoot, 'data', 'core', 'blocks');
    loadBlocksFromDir(coreRoot, 'core', registry, testEnv);

    if (projectId && isExistingProjectId(projectId)) {
        const projectBlocksRoot = path.join(storageConfig.projectsDir, projectId, 'blocks');
        loadBlocksFromDir(projectBlocksRoot, null, registry, testEnv);
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
    writeFileAtomicSync(filePath, JSON.stringify(toWrite, null, 4));
    return toWrite as BlockSchema;
}

function projectBlocksDir(projectId: string): string {
    return path.join(storageConfig.projectsDir, projectId, 'blocks');
}

function projectBlockFilePath(projectId: string, slug: string): string {
    return path.join(projectBlocksDir(projectId), `${slug}.json`);
}

/**
 * Parse route/query `id` for project block APIs: the block's name, without a namespace (`hero`).
 */
export function parseProjectBlockIdParam(projectId: string, param: string): string {
    const decoded = decodeURIComponent(param).trim();
    if (!decoded) {
        throw new Error('Empty block id');
    }
    const slug = decoded;
    if (slug.includes('/')) throw ownName(slug);
    if (!slug || slug.includes('..')) {
        throw new Error('Invalid block slug');
    }
    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
        throw new Error('Invalid block slug');
    }
    return slug;
}

/** A project's own block named with a slash: refused, saying the rule. */
function ownName(name: string) {
    return Object.assign(
        new Error(
            `A project's own block is named without a namespace ("${name.split('/').pop()}", not "${name}"): a name with a slash is the server's (core/…, a plugin's).`
        ),
        { status: 400, code: 'BLOCK_TYPE_NAMESPACED' }
    );
}

function slugForNewProjectBlock(typeField: string): string {
    const t = typeField.trim();
    if (!t) {
        throw new Error('Block schema must have a "type" field');
    }
    if (t.includes('/')) throw ownName(t);
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
 * `schema.type` is its name, without a namespace (`hero`): a name with a slash is the server's.
 */
export function createProjectBlock(projectId: string, schema: BlockSchema): BlockSchema {
    if (!isValidId(projectId) || !isExistingProjectId(projectId)) {
        throw new Error(`Project "${projectId}" does not exist`);
    }
    if (!schema?.type) {
        throw new Error('Block schema must have a "type" field');
    }
    const safeSlug = slugForNewProjectBlock(schema.type);
    const normalizedType = safeSlug;
    const dir = projectBlocksDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = projectBlockFilePath(projectId, safeSlug);
    if (fs.existsSync(filePath)) {
        throw new Error(`Block type "${normalizedType}" already exists in this project`);
    }
    if (getCountLimit(projectId, 'blocks') !== null) {
        const taken = fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
        assertCountRoom(projectId, 'blocks', taken);
    }
    const toWrite = blockPayloadFromInput(normalizedType, safeSlug, schema);
    assertFieldDefinitions(toWrite.fields, `Block type "${normalizedType}"`);
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
            `Project block "${slug}" not found in "${projectId}" (the server's core/* types can't be changed here)`
        );
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const current = JSON.parse(raw) as BlockSchema;
    const normalizedType = slug;

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

    assertFieldDefinitions(next.fields, `Block type "${next.type}"`);
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
            `Project block "${slug}" not found in "${projectId}" (the server's types aren't deleted here)`
        );
    }
    fs.unlinkSync(filePath);
}

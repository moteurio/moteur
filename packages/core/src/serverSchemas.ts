import fs from 'fs';
import path from 'path';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import { storageConfig } from './config/storageConfig.js';
import { shippedBlockSchemas } from './blocks.js';
import { shippedStructureSchemas } from './structures.js';
import { validateStructure } from './validators/validateStructure.js';
import { normalizeType } from './utils/normalizeType.js';
import { writeJsonAtomic } from './utils/fileUtils.js';

/**
 * Server-wide blocks and structures (the `core/` namespace), offered to every project. Some ship
 * with the engine or a plugin; a file in data/core/<kind>/ adds one, or changes a shipped one of
 * the same type. Deleting the file brings the shipped one back.
 */

export type ServerSchemaKind = 'blocks' | 'structures';

export type ServerSchema = {
    type: string;
    schema: BlockSchema | StructureSchema;
    /** `shipped`: as it comes. `file`: added on this server. `changed`: a shipped one, changed here. */
    origin: 'shipped' | 'file' | 'changed';
};

const SLUG = /^[a-z0-9][a-z0-9-_]*$/;

const dirOf = (kind: ServerSchemaKind) => path.join(storageConfig.dataRoot, 'data', 'core', kind);

/** `core/hero` or `hero` → `hero`; anything else is refused. */
function slugOf(type: string): string {
    const t = normalizeType(type.trim());
    const [ns, slug, ...rest] = t.split('/');
    if (ns !== 'core' || !slug || rest.length || !SLUG.test(slug)) {
        throw new Error(
            `Server-wide types are "core/<name>" (lowercase letters, digits, - and _): "${type}"`
        );
    }
    return slug;
}

type ServerFile = { schema: BlockSchema | StructureSchema; file: string };

function readFiles(kind: ServerSchemaKind): Map<string, ServerFile> {
    const out = new Map<string, ServerFile>();
    const dir = dirOf(kind);
    if (!fs.existsSync(dir)) return out;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        try {
            const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as {
                type?: string;
                id?: string;
            };
            const type = parsed.type ?? parsed.id;
            if (!type) continue;
            out.set(normalizeType(type), {
                schema: { ...parsed, type: normalizeType(type) } as BlockSchema,
                file: path.join(dir, file)
            });
        } catch (err) {
            console.warn(
                `[Moteur] Skipping unreadable ${kind} file ${file}:`,
                (err as Error).message
            );
        }
    }
    return out;
}

const shipped = (kind: ServerSchemaKind): Record<string, BlockSchema | StructureSchema> =>
    kind === 'blocks' ? shippedBlockSchemas() : shippedStructureSchemas();

export function listServerSchemas(kind: ServerSchemaKind): ServerSchema[] {
    const fromCode = shipped(kind);
    const files = readFiles(kind);
    const types = new Set([...Object.keys(fromCode).map(normalizeType), ...files.keys()]);
    return [...types]
        .filter(t => t.startsWith('core/'))
        .sort()
        .map(type => {
            const file = files.get(type);
            const code = fromCode[type];
            return {
                type,
                schema: file?.schema ?? code!,
                origin: file ? (code ? 'changed' : 'file') : 'shipped'
            };
        });
}

/** Write the file for a type (adding it, or changing a shipped one). */
export function saveServerSchema(
    kind: ServerSchemaKind,
    type: string,
    schema: Record<string, unknown>
): ServerSchema {
    const slug = slugOf(type);
    const full = `core/${slug}`;
    const next = { ...schema, type: full } as BlockSchema & StructureSchema;
    if (!next.label || typeof next.label !== 'string') throw new Error('A label is required');
    if (!next.fields || typeof next.fields !== 'object')
        throw new Error('fields must be an object');
    if (kind === 'structures') {
        const issues = validateStructure(next as StructureSchema).issues;
        if (issues.length) {
            throw new Error(
                `Structure validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join(', ')}`
            );
        }
    }
    const dir = dirOf(kind);
    fs.mkdirSync(dir, { recursive: true });
    writeJsonAtomic(readFiles(kind).get(full)?.file ?? path.join(dir, `${slug}.json`), next);
    return listServerSchemas(kind).find(s => s.type === full)!;
}

/** Remove the file for a type. A shipped one comes back as it was. */
export function deleteServerSchema(kind: ServerSchemaKind, type: string): void {
    const full = `core/${slugOf(type)}`;
    const found = readFiles(kind).get(full);
    if (!found) {
        throw new Error(`No server file for "${full}": shipped ones cannot be deleted`);
    }
    fs.unlinkSync(found.file);
}

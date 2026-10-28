import type { ImportBundle } from '@moteurio/types/Import.js';

/**
 * A bundle's own blocks by their short names, made the project's: a block typed `text` is saved
 * as `<project>/text`, so `allowedBlockTypes: ["text"]` and a block `{ "type": "text", "data" }`
 * in pages or entries become `<project>/text` too. A bundle can then bring its blocks to any
 * project (a starter's content model) without knowing the project's id.
 */
export function withOwnBlocks(bundle: ImportBundle, projectId: string): ImportBundle {
    const own = new Set(
        (bundle.blocks ?? [])
            .map(b => b.type)
            .filter(t => typeof t === 'string' && !t.includes('/'))
    );
    if (!own.size) return bundle;
    const full = (type: unknown) =>
        typeof type === 'string' && own.has(type) ? `${projectId}/${type}` : type;
    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(walk);
        if (!value || typeof value !== 'object') return value;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = walk(v);
        if (Array.isArray(out.allowedBlockTypes))
            out.allowedBlockTypes = out.allowedBlockTypes.map(full);
        // A block in content: its type and its data.
        if ('data' in out && typeof out.type === 'string') out.type = full(out.type);
        return out;
    };
    const { blocks, ...rest } = bundle;
    return {
        ...(walk(rest) as ImportBundle),
        // The blocks themselves keep their short type: saving them adds the namespace.
        ...(blocks && {
            blocks: blocks.map(b => ({ ...(walk(b) as typeof b), type: b.type }))
        })
    };
}

/**
 * Strips block-schema-only properties from public API responses.
 * - variantHints: documentation only, never returned to public API
 * - editorial: blocks with editorial: true are stripped from entry/layout block arrays
 */

import type { BlockSchema } from '@moteurio/types/Block.js';
import type { Block } from '@moteurio/types/Block.js';
import { listBlocks } from '@moteurio/core/blocks.js';

/**
 * Strips variantHints from a BlockSchema. Same pattern as ui on fields.
 */
export function stripVariantHintsFromBlockSchema<T extends Record<string, unknown>>(schema: T): T {
    if (!schema || typeof schema !== 'object') return schema;
    const { variantHints: _vh, ...rest } = schema;
    return rest as T;
}

/**
 * Filters out blocks whose schema has editorial: true from a blocks array.
 * Used when returning entry bodies or layout.blocks to public API consumers.
 */
export function stripEditorialBlocks(
    blocks: Block[],
    blockSchemas: Record<string, BlockSchema> = listBlocks()
): Block[] {
    if (!Array.isArray(blocks)) return blocks;
    return blocks.filter(b => {
        const schema = blockSchemas[b.type] ?? blockSchemas[`core/${b.type}`];
        return !schema?.editorial;
    });
}

/**
 * Recursively strips editorial blocks from any object that may contain
 * block arrays (e.g. layout.blocks, entry.data.layout.blocks, nested structures).
 */
export function stripEditorialBlocksFromPayload<T>(
    payload: T,
    blockSchemas: Record<string, BlockSchema> = listBlocks()
): T {
    if (payload == null) return payload;
    if (Array.isArray(payload)) {
        const arr = payload as unknown[];
        const isBlockArray = arr.every(
            item => item != null && typeof item === 'object' && 'type' in item && 'data' in item
        );
        if (isBlockArray && arr.length > 0) {
            return stripEditorialBlocks(arr as Block[], blockSchemas) as T;
        }
        return arr.map(item => stripEditorialBlocksFromPayload(item, blockSchemas)) as T;
    }
    if (typeof payload === 'object') {
        const result = {} as Record<string, unknown>;
        for (const [k, v] of Object.entries(payload)) {
            result[k] = stripEditorialBlocksFromPayload(v, blockSchemas);
        }
        return result as T;
    }
    return payload;
}

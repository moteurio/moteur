import { isDeepStrictEqual } from 'node:util';

/** Returns a copy of a stored document without its bookkeeping fields (save time and audit data such as who saved it and how many times). */
function withoutBookkeeping(doc: unknown): unknown {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
    const { updatedAt: _updatedAt, ...rest } = doc as Record<string, unknown>;
    const meta = rest.meta as Record<string, unknown> | undefined;
    if (meta && typeof meta === 'object' && 'audit' in meta) {
        const { audit: _audit, ...otherMeta } = meta;
        rest.meta = otherMeta;
    }
    return JSON.parse(JSON.stringify(rest));
}

/** The result of a restore: the restored document, and whether it differs from the current one at all. */
export type Restored<T> = { restored: T; changed: boolean };

/**
 * Whether saving `next` over `current` would change anything other than the bookkeeping fields. A
 * save that changes nothing is skipped, so the history only lists saves that changed something.
 */
export function sameContent(current: unknown, next: unknown): boolean {
    return isDeepStrictEqual(withoutBookkeeping(current), withoutBookkeeping(next));
}

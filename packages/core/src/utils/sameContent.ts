import { isDeepStrictEqual } from 'node:util';

/** A stored document without its bookkeeping: when it was saved, by whom and how many times. */
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

/** A restore's result: the document, and whether it differed from that version at all. */
export type Restored<T> = { restored: T; changed: boolean };

/**
 * Whether saving `next` over `current` would change anything but the bookkeeping. A save that
 * changes nothing is skipped, so the history only lists saves that did something.
 */
export function sameContent(current: unknown, next: unknown): boolean {
    return isDeepStrictEqual(withoutBookkeeping(current), withoutBookkeeping(next));
}

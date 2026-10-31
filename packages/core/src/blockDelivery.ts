/**
 * What a plugin adds to its blocks as sites get them: an embed's HTML from its provider, a poll's
 * counts, a map's tiles. `registerBlockDelivery(type, resolve)` is called for each block of that
 * type a channel sends, wherever it sits (a body, a page's fields, a block inside a block), with
 * the block's data in the language asked for; it returns the data to send.
 *
 * It runs when an answer is worked out, not on each request: the answer is then kept with the
 * rest (deliveryCache). A delivery that throws, or takes longer than DELIVERY_TIMEOUT_MS, leaves
 * the block as it was: a slow provider never breaks a page.
 */

export type BlockDeliveryContext = {
    projectId: string;
    /** The language asked for (`?locale=`), when one was. */
    locale?: string;
};

export type BlockDelivery = (
    data: Record<string, unknown>,
    context: BlockDeliveryContext
) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;

const deliveries = new Map<string, BlockDelivery>();

/** How long one block's delivery may take before the block is sent as it is. */
export const DELIVERY_TIMEOUT_MS = 3000;

/** A plugin's step for its block `type` (`play/oembed`): the last one registered wins. */
export function registerBlockDelivery(type: string, resolve: BlockDelivery): void {
    deliveries.set(type, resolve);
}

/** Forget every delivery step (tests). */
export function clearBlockDeliveries(): void {
    deliveries.clear();
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    v != null && typeof v === 'object' && !Array.isArray(v);

const isBlock = (v: unknown): v is { type: string; data?: unknown } =>
    isPlainObject(v) && typeof v.type === 'string' && 'data' in v;

async function deliverOne(
    resolve: BlockDelivery,
    data: Record<string, unknown>,
    context: BlockDeliveryContext
): Promise<Record<string, unknown>> {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
        const out = await Promise.race([
            Promise.resolve().then(() => resolve(data, context)),
            new Promise<undefined>(done => {
                timer = globalThis.setTimeout(() => done(undefined), DELIVERY_TIMEOUT_MS);
            })
        ]);
        return isPlainObject(out) ? out : data;
    } catch (err) {
        console.warn('[moteur] A block delivery failed; the block is sent as it is:', err);
        return data;
    } finally {
        globalThis.clearTimeout(timer);
    }
}

/**
 * The payload with each block of a type that has a delivery step resolved, at any depth; the
 * blocks inside a resolved block too. Untouched (the same objects) when no step is registered.
 */
export async function deliverBlocks<T>(payload: T, context: BlockDeliveryContext): Promise<T> {
    if (deliveries.size === 0) return payload;
    const walk = async (value: unknown): Promise<unknown> => {
        if (Array.isArray(value)) return Promise.all(value.map(walk));
        if (!isPlainObject(value)) return value;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = await walk(v);
        if (isBlock(out) && isPlainObject(out.data)) {
            const resolve = deliveries.get(out.type);
            if (resolve) out.data = await deliverOne(resolve, out.data, context);
        }
        return out;
    };
    return (await walk(payload)) as T;
}

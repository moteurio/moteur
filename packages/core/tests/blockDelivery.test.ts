import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearBlockDeliveries,
    deliverBlocks,
    DELIVERY_TIMEOUT_MS,
    registerBlockDelivery
} from '../src/blockDelivery.js';

const ctx = { projectId: 'site', locale: 'fr' };

describe('what plugins add to their blocks as sites get them', () => {
    afterEach(() => {
        clearBlockDeliveries();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('leaves the payload as it is (the same objects) when no plugin adds anything', async () => {
        const payload = { body: [{ type: 'play/embed', data: { url: 'x' } }] };
        expect(await deliverBlocks(payload, ctx)).toBe(payload);
    });

    it('resolves its blocks wherever they sit, with the language asked for', async () => {
        const seen: unknown[] = [];
        registerBlockDelivery('play/embed', async (data, context) => {
            seen.push(context);
            return { ...data, html: `<iframe src="${data.url}"></iframe>` };
        });
        const out = await deliverBlocks(
            {
                fields: {
                    body: [
                        { type: 'core/paragraph', data: { text: 'Hi' } },
                        { type: 'play/embed', data: { url: 'a' } },
                        // A block inside a block.
                        {
                            type: 'core/container',
                            data: { blocks: [{ type: 'play/embed', data: { url: 'b' } }] }
                        }
                    ]
                }
            },
            ctx
        );
        expect(out.fields.body[0]).toEqual({ type: 'core/paragraph', data: { text: 'Hi' } });
        expect(out.fields.body[1].data).toEqual({ url: 'a', html: '<iframe src="a"></iframe>' });
        expect(
            (out.fields.body[2].data as { blocks: { data: { html: string } }[] }).blocks[0].data
                .html
        ).toBe('<iframe src="b"></iframe>');
        expect(seen).toEqual([ctx, ctx]);
    });

    it('sends a block as it is when its plugin fails or takes too long', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerBlockDelivery('play/broken', () => {
            throw new Error('provider down');
        });
        registerBlockDelivery('play/slow', () => new Promise(() => {}));
        registerBlockDelivery('play/nothing', () => undefined);
        vi.useFakeTimers();
        const pending = deliverBlocks(
            [
                { type: 'play/broken', data: { a: 1 } },
                { type: 'play/slow', data: { b: 2 } },
                { type: 'play/nothing', data: { c: 3 } }
            ],
            ctx
        );
        await vi.advanceTimersByTimeAsync(DELIVERY_TIMEOUT_MS + 10);
        expect(await pending).toEqual([
            { type: 'play/broken', data: { a: 1 } },
            { type: 'play/slow', data: { b: 2 } },
            { type: 'play/nothing', data: { c: 3 } }
        ]);
    });
});

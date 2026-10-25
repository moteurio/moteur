import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), resolve: vi.fn(), validate: vi.fn() }));
vi.mock('node:https', () => ({ request: mocks.request }));
vi.mock('node:http', () => ({ request: mocks.request }));
vi.mock('../../src/webhooks/networkPolicy.js', () => ({
    resolveWebhookTarget: mocks.resolve,
    validateUrl: mocks.validate
}));
import { postWebhook } from '../../src/webhooks/outboundHttp.js';

describe('webhook transport', () => {
    let req: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
    let res: EventEmitter & { statusCode: number; destroy: ReturnType<typeof vi.fn> };
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.request.mockReset();
        mocks.resolve.mockReset().mockResolvedValue({ address: '93.184.216.34', family: 4 });
        mocks.validate.mockReset().mockImplementation(() => mocks.resolve());
        req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
        res = Object.assign(new EventEmitter(), { statusCode: 200, destroy: vi.fn() });
        mocks.request.mockReturnValue(req);
    });
    afterEach(() => vi.useRealTimers());

    async function start() {
        const result = postWebhook(
            'https://receiver.test/hook',
            { Host: 'internal', 'X-Custom': 'yes' },
            '{}',
            1000,
            10
        );
        await vi.advanceTimersByTimeAsync(0);
        return { result, respond: () => mocks.request.mock.calls[0][2](res) };
    }
    it('pins the validated address and retains the original TLS hostname', async () => {
        const { result, respond } = await start();
        const [url, options] = mocks.request.mock.calls[0];
        expect(url.hostname).toBe('receiver.test');
        expect(options.agent).toBe(false);
        expect(options.headers.Host).toBeUndefined();
        const cb = vi.fn();
        options.lookup('receiver.test', {}, cb);
        expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4);
        respond();
        res.emit('end');
        await result;
    });
    it('returns redirects as failures without following Location', async () => {
        const { result, respond } = await start();
        res.statusCode = 302;
        respond();
        res.emit('end');
        expect((await result).status).toBe(302);
        expect(mocks.request).toHaveBeenCalledTimes(1);
    });
    it('stops reading once the response reaches the byte budget', async () => {
        const { result, respond } = await start();
        respond();
        res.emit('data', Buffer.alloc(10000, 'a'));
        expect((await result).body).toBe('a'.repeat(10));
        expect(res.destroy).toHaveBeenCalled();
    });
    it('times out a stalled response body after headers', async () => {
        const { result, respond } = await start();
        const rejected = expect(result).rejects.toThrow('timed out');
        respond();
        await vi.advanceTimersByTimeAsync(1000);
        await rejected;
        expect(res.destroy).toHaveBeenCalled();
    });
    it('times out DNS and never starts a request after the deadline', async () => {
        let resolve!: (value: { address: string; family: number }) => void;
        mocks.resolve.mockReturnValue(
            new Promise(r => {
                resolve = r;
            })
        );
        const { result } = await start();
        const rejected = expect(result).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(1000);
        await rejected;
        resolve({ address: '93.184.216.34', family: 4 });
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.request).not.toHaveBeenCalled();
    });
});

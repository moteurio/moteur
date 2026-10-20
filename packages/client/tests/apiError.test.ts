import { describe, expect, it, vi } from 'vitest';

let fail: (err: unknown) => Promise<never> = () => Promise.reject(new Error('not set up'));

vi.mock('axios', () => ({
    default: {
        create: () => ({
            interceptors: {
                request: { use: () => {} },
                response: {
                    use: (_ok: unknown, onFail: typeof fail) => {
                        fail = onFail;
                    }
                }
            }
        }),
        isAxiosError: () => true
    }
}));

import { createRequestClient, MoteurApiError } from '../src/client.js';

const answer = (status: number, data: unknown, headers: Record<string, string> = {}) => ({
    response: { status, statusText: '', data, headers }
});

describe('MoteurApiError', () => {
    it('carries the body, a code, and how long to wait', () => {
        const err = new MoteurApiError('x', {
            status: 429,
            response: answer(
                429,
                { error: 'Slow down', code: 'rate_limited' },
                { 'retry-after': '30' }
            ).response
        });
        expect(err.code).toBe('rate_limited');
        expect(err.data).toEqual({ error: 'Slow down', code: 'rate_limited' });
        expect(err.retryAfter).toBe(30);
    });

    it('takes a snake_case error as the code, but not a sentence', () => {
        const credits = new MoteurApiError('x', {
            status: 402,
            response: answer(402, { error: 'insufficient_credits' }).response
        });
        expect(credits.code).toBe('insufficient_credits');
        const sentence = new MoteurApiError('x', {
            status: 404,
            response: answer(404, { error: 'Entry not found' }).response
        });
        expect(sentence.code).toBeUndefined();
        expect(sentence.retryAfter).toBeUndefined();
    });
});

describe('onError', () => {
    it('hears every failure, and cannot change what the caller gets', async () => {
        const heard: MoteurApiError[] = [];
        createRequestClient({
            baseURL: 'https://api.example',
            onError: e => {
                heard.push(e);
                throw new Error('listener broke');
            }
        });
        await expect(fail(answer(402, { error: 'insufficient_credits' }))).rejects.toMatchObject({
            status: 402,
            code: 'insufficient_credits'
        });
        expect(heard).toHaveLength(1);
    });
});

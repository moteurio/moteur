import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { sendApiError } from '../../src/utils/apiError.js';

/** What sendApiError answers for an unexpected failure, with NODE_ENV as given. */
function answer(nodeEnv: string | undefined) {
    if (nodeEnv === undefined) vi.stubEnv('NODE_ENV', '');
    else vi.stubEnv('NODE_ENV', nodeEnv);
    let body: Record<string, unknown> = {};
    const res = {
        locals: {},
        setHeader: () => res,
        status: () => res,
        json: (b: Record<string, unknown>) => {
            body = b;
            return res;
        }
    } as unknown as Response;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendApiError(
        res,
        { requestId: 'r1', method: 'GET', url: '/x' } as Request,
        new Error('db at /srv/x failed')
    );
    return body;
}

describe('an unexpected failure, as the client hears it', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('says what went wrong, stack included, while developing', () => {
        const body = answer('development');
        expect(body.error).toBe('db at /srv/x failed');
        expect(body.details).toMatch(/Error: db at/);
    });

    it('says only "Internal server error" in production, and on a server that never set NODE_ENV', () => {
        for (const env of ['production', undefined, 'staging']) {
            const body = answer(env);
            expect(body).toEqual({ error: 'Internal server error', requestId: 'r1' });
        }
    });
});

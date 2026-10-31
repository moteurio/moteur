import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    info: vi.fn(),
    email: vi.fn(),
    complete: vi.fn(),
    time: 0,
    kind: 'person',
    agent: false
}));
vi.mock('@moteurio/core/providerSignIn.js', () => ({
    connectProvider: mocks.connect,
    describeProviderSignIn: mocks.info,
    requestProviderEmail: mocks.email,
    completeProviderEmail: mocks.complete
}));
vi.mock('@moteurio/core/auth.js', () => ({
    verifyJWT: () => ({ sid: 's1', auth_time: mocks.time }),
    rotatePersonalSession: () => 'connected-token'
}));
vi.mock('@moteurio/core/authSessions.js', () => ({
    requireAuthSession: () => ({ kind: mocks.kind })
}));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireAuth: (req: any, _res: any, next: () => void) => {
        req.user = { id: 'u1', ...(mocks.agent ? { agent: { reviewOnly: true } } : {}) };
        next();
    }
}));
vi.mock('../../src/middlewares/rateLimit.js', () => ({
    verificationRateLimiter: (_req: any, _res: any, next: () => void) => next()
}));
import route from '../../src/auth/providerSignIn.js';

function call(
    url: string,
    body: object = { ticket: 'ticket' }
): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
        const req = {
            method: 'POST',
            url,
            params: {},
            body,
            headers: {
                cookie: 'moteur_provider=browser-proof',
                authorization: 'Bearer personal-token'
            }
        };
        const res = {
            statusCode: 200,
            setHeader() {},
            status(code: number) {
                this.statusCode = code;
                return this;
            },
            json(data: unknown) {
                resolve({ status: this.statusCode, body: data });
            }
        };
        (route as any).handle(req, res, (error: unknown) =>
            reject(error ?? new Error('Unmatched route'))
        );
    });
}
describe('provider proof API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.time = Math.floor(Date.now() / 1000);
        mocks.kind = 'person';
        mocks.agent = false;
        mocks.connect.mockResolvedValue({ id: 'u1' });
    });
    it('requires explicit confirmation from a recently authenticated personal session', async () => {
        expect(await call('/provider/link')).toEqual({
            status: 200,
            body: { token: 'connected-token' }
        });
        expect(mocks.connect).toHaveBeenCalledWith('ticket', 'browser-proof', 'u1');
    });
    it.each(['old', 'agent', 'delegated'])(
        'rejects %s sessions without connecting anything',
        async mode => {
            if (mode === 'old') mocks.time -= 601;
            if (mode === 'agent') mocks.agent = true;
            if (mode === 'delegated') mocks.kind = 'delegated';
            const result = await call('/provider/link');
            expect(result.status).toBe(403);
            expect(result.body.code).toBe('REAUTH_REQUIRED');
            expect(mocks.connect).not.toHaveBeenCalled();
        }
    );
    it('passes the browser binding to code delivery and verification', async () => {
        mocks.email.mockResolvedValue(undefined);
        expect(
            (
                await call('/provider/email', {
                    ticket: 'ticket',
                    email: 'new@example.test',
                    locale: 'fr-CA'
                })
            ).status
        ).toBe(200);
        expect(mocks.email).toHaveBeenCalledWith(
            'ticket',
            'browser-proof',
            'new@example.test',
            'fr-CA'
        );
        mocks.complete.mockResolvedValue({ token: 'verified-token' });
        expect(
            (await call('/provider/verify', { ticket: 'ticket', code: '123456' })).body.token
        ).toBe('verified-token');
        expect(mocks.complete).toHaveBeenCalledWith(
            'ticket',
            'browser-proof',
            '123456',
            expect.any(Function)
        );
    });
});

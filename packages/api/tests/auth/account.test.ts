import request from 'supertest';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    authTime: 0,
    kind: 'person',
    agent: false,
    requestEmailChange: vi.fn(),
    confirmEmailChange: vi.fn(),
    accountExport: vi.fn(),
    accountDeletion: vi.fn(),
    deleteAccount: vi.fn(),
    rotate: vi.fn(() => 'replacement-token')
}));
vi.mock('@moteurio/core/auth.js', () => ({
    verifyJWT: () => ({ sid: 's1', auth_time: m.authTime }),
    rotatePersonalSession: m.rotate
}));
vi.mock('@moteurio/core/authSessions.js', () => ({
    requireAuthSession: () => ({ id: 's1', kind: m.kind })
}));
vi.mock('@moteurio/core/emailSignIn.js', () => ({
    requestEmailChange: m.requestEmailChange,
    confirmEmailChange: m.confirmEmailChange
}));
vi.mock('@moteurio/core/account.js', () => ({
    accountExport: m.accountExport,
    accountDeletion: m.accountDeletion,
    deleteAccount: m.deleteAccount
}));
vi.mock('@moteurio/core/projects.js', () => ({ getProjectIdsForUser: () => ['p1'] }));
vi.mock('@moteurio/core/providerSignIn.js', () => ({}));
vi.mock('@moteurio/core/accountConnections.js', () => ({}));
vi.mock('../../src/middlewares/rateLimit.js', () => ({
    verificationRateLimiter: (_req: any, _res: any, next: () => void) => next()
}));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireAuth: (req: any, _res: any, next: () => void) => {
        req.user = { id: 'u1', ...(m.agent ? { agent: { name: 'Claude' } } : {}) };
        next();
    }
}));

import router from '../../src/auth/account.js';

const app = express();
app.use(express.json());
app.use('/auth', router);
const as = <T extends request.Test>(r: T) => r.set('Authorization', 'Bearer personal');

describe('your account: email, export, deletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        m.authTime = Math.floor(Date.now() / 1000);
        m.kind = 'person';
        m.agent = false;
    });

    it('sends a code to the new address after a recent sign-in', async () => {
        const res = await as(request(app).post('/auth/me/email')).send({ email: 'new@x.test' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ sent: true });
        expect(res.headers['cache-control']).toBe('no-store');
        expect(m.requestEmailChange).toHaveBeenCalledWith('u1', 'new@x.test', undefined);
    });

    it('asks for a fresh sign-in, and refuses agents', async () => {
        m.authTime = Math.floor(Date.now() / 1000) - 601;
        const stale = await as(request(app).post('/auth/me/email')).send({ email: 'n@x.test' });
        expect(stale.status).toBe(403);
        expect(stale.body.code).toBe('REAUTH_REQUIRED');
        m.agent = true;
        const agent = await as(request(app).get('/auth/me/export'));
        expect(agent.status).toBe(403);
        expect(agent.body.code).toBe('PERSONAL_SESSION_REQUIRED');
        m.agent = false;
        m.kind = 'delegated';
        expect((await as(request(app).get('/auth/me/deletion'))).status).toBe(403);
    });

    it('passes the code limits on, with how long to wait', async () => {
        m.requestEmailChange.mockRejectedValueOnce(
            Object.assign(new Error('Wait a minute.'), {
                status: 429,
                code: 'EMAIL_CODE_WAIT',
                retryAfter: 37
            })
        );
        const res = await as(request(app).post('/auth/me/email')).send({ email: 'n@x.test' });
        expect(res.status).toBe(429);
        expect(res.body).toMatchObject({ code: 'EMAIL_CODE_WAIT', retryAfter: 37 });
        expect(res.headers['retry-after']).toBe('37');
        m.requestEmailChange.mockRejectedValueOnce(
            Object.assign(new Error('Taken'), { status: 409, code: 'EMAIL_TAKEN' })
        );
        const taken = await as(request(app).post('/auth/me/email')).send({ email: 't@x.test' });
        expect(taken.status).toBe(409);
        expect(taken.body.code).toBe('EMAIL_TAKEN');
    });

    it('confirms the change and answers a replacement token', async () => {
        m.confirmEmailChange.mockResolvedValueOnce({
            user: { id: 'u1', email: 'new@x.test', passwordHash: 'secret', roles: [] },
            previousEmail: 'old@x.test'
        });
        // Long after signing in: the code is the proof here.
        m.authTime = 0;
        const res = await as(request(app).post('/auth/me/email/verify')).send({
            email: 'new@x.test',
            code: '123 456'
        });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            token: 'replacement-token',
            user: { id: 'u1', email: 'new@x.test', roles: [], projects: ['p1'] }
        });
        expect(m.confirmEmailChange).toHaveBeenCalledWith('u1', 'new@x.test', '123 456');
        expect(m.rotate).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'u1' }),
            expect.objectContaining({ id: 's1' })
        );
    });

    it('downloads the export as a file', async () => {
        m.accountExport.mockResolvedValueOnce({
            exportedAt: '2026-10-31T12:00:00.000Z',
            account: { id: 'u1' }
        });
        const res = await as(request(app).get('/auth/me/export'));
        expect(res.status).toBe(200);
        expect(res.headers['content-disposition']).toBe(
            'attachment; filename="moteur-account-2026-10-31.json"'
        );
        expect(JSON.parse(res.text)).toMatchObject({ account: { id: 'u1' } });
        expect(m.accountExport).toHaveBeenCalledWith('u1', 's1');
    });

    it('says what deleting would do, and refuses while someone would be left without an admin', async () => {
        m.accountDeletion.mockReturnValueOnce({ deletes: [], leaves: [], blocked: [] });
        expect((await as(request(app).get('/auth/me/deletion'))).body).toEqual({
            deletes: [],
            leaves: [],
            blocked: []
        });
        m.deleteAccount.mockRejectedValueOnce(
            Object.assign(new Error('Make someone else an admin first.'), {
                status: 409,
                code: 'SOLE_ADMIN',
                projects: [{ id: 'p1', name: 'Mine' }]
            })
        );
        const res = await as(request(app).delete('/auth/me')).send({ email: 'u1@x.test' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
            code: 'SOLE_ADMIN',
            projects: [{ id: 'p1', name: 'Mine' }]
        });
    });

    it('deletes the account after a recent sign-in', async () => {
        m.deleteAccount.mockResolvedValueOnce({});
        const res = await as(request(app).delete('/auth/me')).send({ email: 'u1@x.test' });
        expect(res.status).toBe(204);
        expect(m.deleteAccount).toHaveBeenCalledWith('u1', 'u1@x.test');
        m.authTime = 0;
        const stale = await as(request(app).delete('/auth/me')).send({ email: 'u1@x.test' });
        expect(stale.body.code).toBe('REAUTH_REQUIRED');
        m.deleteAccount.mockRejectedValueOnce(
            Object.assign(new Error('Type your email'), { status: 400, code: 'CONFIRM_MISMATCH' })
        );
        m.authTime = Math.floor(Date.now() / 1000);
        const wrong = await as(request(app).delete('/auth/me')).send({ email: 'x' });
        expect(wrong.status).toBe(400);
        expect(wrong.body.code).toBe('CONFIRM_MISMATCH');
    });
});

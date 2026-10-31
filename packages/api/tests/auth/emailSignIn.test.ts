import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/rateLimit.js', () => ({
    verificationRateLimiter: (_req: any, _res: any, next: any) => next()
}));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = { id: 'user:1' };
        next();
    }
}));
vi.mock('@moteurio/core/emailSignIn.js', () => ({
    signupOpen: vi.fn(() => true),
    emailCodesAvailable: vi.fn(() => true),
    requestEmailCode: vi.fn(async () => undefined),
    verifyEmailCode: vi.fn()
}));
vi.mock('@moteurio/core/serverSettings.js', () => ({
    legalLinks: () => ({ terms: 'https://www.moteur.io/terms' })
}));
vi.mock('@moteurio/core/passkeys.js', () => ({ passkeysAvailable: vi.fn(() => false) }));
vi.mock('@moteurio/core/onboarding.js', () => ({
    updateOnboarding: vi.fn(async () => ({ intent: 'agency' })),
    demoProjectFor: vi.fn(async () => 'demo-1'),
    sendWelcome: vi.fn()
}));

import router from '../../src/auth/emailSignIn.js';
import { requestEmailCode, verifyEmailCode } from '@moteurio/core/emailSignIn.js';

const app = express();
app.use(express.json());
app.use('/auth', router);

describe('email sign-in routes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('says whether the server takes new accounts, and where its legal pages are', async () => {
        const res = await request(app).get('/auth/signup');
        expect(res.body).toEqual({
            open: true,
            emailCodes: true,
            passkeys: false,
            legal: { terms: 'https://www.moteur.io/terms' }
        });
    });

    it('passes the page and campaign along, and answers the same for everyone', async () => {
        const res = await request(app)
            .post('/auth/email/code')
            .send({
                email: 'theo@agency.test',
                from: '/for/agencies',
                goal: 'start',
                campaign: { source: 'x' },
                locale: 'fr'
            });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ sent: true });
        expect(res.headers['cache-control']).toBe('no-store');
        expect(requestEmailCode).toHaveBeenCalledWith('theo@agency.test', {
            from: '/for/agencies',
            goal: 'start',
            campaign: { source: 'x' },
            locale: 'fr'
        });
    });

    it('answers a session, or a two-step ticket', async () => {
        (verifyEmailCode as any).mockResolvedValueOnce({ token: 't', isNew: true, user: {} });
        const one = await request(app)
            .post('/auth/email/verify')
            .send({ email: 'a@b.co', code: '123456', name: 'A' });
        expect(one.body).toEqual({ token: 't', isNew: true });
        (verifyEmailCode as any).mockResolvedValueOnce({ twoFactor: { ticket: 'tk' } });
        const two = await request(app)
            .post('/auth/email/verify')
            .send({ email: 'a@b.co', code: '123456' });
        expect(two.body).toEqual({ twoFactor: true, ticket: 'tk' });
    });

    it('turns a wrong code into a 400 with its code', async () => {
        (verifyEmailCode as any).mockRejectedValueOnce(
            Object.assign(new Error('That code is not right.'), {
                status: 400,
                code: 'EMAIL_CODE_WRONG'
            })
        );
        const res = await request(app)
            .post('/auth/email/verify')
            .send({ email: 'a@b.co', code: '000000' });
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'EMAIL_CODE_WRONG' });
    });

    it('says how many seconds to wait before another code', async () => {
        (requestEmailCode as any).mockRejectedValueOnce(
            Object.assign(new Error('Wait a minute before asking for another code.'), {
                status: 429,
                code: 'EMAIL_CODE_WAIT',
                retryAfter: 42
            })
        );
        const res = await request(app).post('/auth/email/code').send({ email: 'a@b.co' });
        expect(res.status).toBe(429);
        expect(res.body).toMatchObject({ code: 'EMAIL_CODE_WAIT', retryAfter: 42 });
        expect(res.headers['retry-after']).toBe('42');
    });

    it('keeps what you came for, and copies the demo on request', async () => {
        const a = await request(app).patch('/auth/me/onboarding').send({ intent: 'agency' });
        expect(a.body).toEqual({ onboarding: { intent: 'agency' } });
        const b = await request(app).post('/auth/me/demo');
        expect(b.body).toEqual({ projectId: 'demo-1' });
    });
});

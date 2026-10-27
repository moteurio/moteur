import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

let agent = false;
vi.mock('../../src/middlewares/auth.js', () => ({
    requireAuth: (req: any, _res: any, next: () => void) => {
        req.user = {
            id: 'u1',
            roles: [],
            ...(agent && { agent: { name: 'Claude', reviewOnly: true } })
        };
        next();
    }
}));
vi.mock('../../src/middlewares/rateLimit.js', () => ({
    loginRateLimiter: (_req: any, _res: any, next: () => void) => next()
}));
vi.mock('@moteurio/core/users.js', () => ({ getUserById: () => ({ id: 'u1' }) }));
vi.mock('@moteurio/core/twoFactor.js', () => ({
    beginTwoFactor: vi.fn(),
    completeTwoFactor: vi.fn(),
    disableTwoFactor: vi.fn(),
    enableTwoFactor: vi.fn(),
    hasTwoFactor: () => false,
    recoveryCodesLeft: () => 0,
    renewRecoveryCodes: vi.fn(),
    ticketUser: (ticket: string) => {
        if (ticket !== 'tkt') throw Object.assign(new Error('expired'), { statusCode: 401 });
        return 'u1';
    }
}));

import twoFactorRoutes from '../../src/auth/twoFactor';
import * as loginDelayStore from '../../src/auth/loginDelayStore';
import { beginTwoFactor, completeTwoFactor } from '@moteurio/core/twoFactor.js';

const app = express();
app.use(express.json());
app.use('/auth', twoFactorRoutes);

describe('two-step sign-in routes', () => {
    beforeAll(() => {
        vi.spyOn(loginDelayStore, 'sleep').mockResolvedValue(undefined);
    });
    beforeEach(() => {
        vi.clearAllMocks();
        agent = false;
        loginDelayStore.resetLoginDelayStoreForTests();
    });

    it('trades a ticket and a code for a session, and counts wrong codes', async () => {
        vi.mocked(completeTwoFactor).mockResolvedValueOnce({
            token: 'jwt',
            user: { id: 'u1' },
            usedRecovery: false
        } as never);
        const ok = await request(app)
            .post('/auth/two-factor/verify')
            .send({ ticket: 'tkt', code: '123456' });
        expect(ok.status).toBe(200);
        expect(ok.body.token).toBe('jwt');
        expect(ok.headers['cache-control']).toBe('no-store');

        vi.mocked(completeTwoFactor).mockRejectedValueOnce(
            Object.assign(new Error('That code isn’t right.'), {
                statusCode: 401,
                code: 'TWO_FACTOR_INVALID'
            })
        );
        const wrong = await request(app)
            .post('/auth/two-factor/verify')
            .send({ ticket: 'tkt', code: '000000' });
        expect(wrong.status).toBe(401);
        expect(loginDelayStore.getLoginFailureEntry('two-factor:u1')?.attempts).toBe(1);

        const expired = await request(app)
            .post('/auth/two-factor/verify')
            .send({ ticket: 'old', code: '123456' });
        expect(expired.status).toBe(401);
    });

    it('sends the setup with a QR code, to a person only', async () => {
        vi.mocked(beginTwoFactor).mockResolvedValue({
            secret: 'JBSWY3DPEHPK3PXP',
            otpauth: 'otpauth://totp/Moteur:louise?secret=JBSWY3DPEHPK3PXP&issuer=Moteur'
        });
        const res = await request(app).post('/auth/two-factor/setup');
        expect(res.status).toBe(200);
        expect(res.body.qr).toContain('<svg');

        agent = true;
        const refused = await request(app).post('/auth/two-factor/setup');
        expect(refused.status).toBe(403);
    });
});

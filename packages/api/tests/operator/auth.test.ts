import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { addOperator, resetOperatorLockouts } from '@moteurio/core/operators.js';
import { totpCode, totpStep } from '@moteurio/core/totp.js';
import { generateJWT } from '@moteurio/core/auth.js';
import operatorAuth from '../../src/operator/auth.js';
import { requireOperator } from '../../src/middlewares/auth.js';

function app() {
    const a = express();
    a.use(express.json());
    a.use('/operator/auth', operatorAuth);
    a.get('/operator/secret', requireOperator, (req, res) =>
        res.json({ operator: req.operator?.email, actsAs: req.user?.name })
    );
    return a;
}

describe('operator sign-in over HTTP', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-op-api-'));
        vi.stubEnv('OPERATORS_FILE', path.join(dir, 'operators.json'));
        vi.stubEnv('JWT_SECRET', 'test-secret');
        resetOperatorLockouts();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('refuses a user token, even an account admin’s or developer’s', async () => {
        const token = generateJWT({
            id: 'u1',
            email: 'boss@x.com',
            roles: ['admin', 'developer'],
            isActive: true
        } as never);
        const res = await request(app())
            .get('/operator/secret')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('operator_auth');
        expect((await request(app()).get('/operator/secret')).status).toBe(401);
    });

    it('sets up through the one-time link, then signs in with password and code', async () => {
        const { token } = addOperator({ email: 'ops@moteur.io', name: 'Ops' });
        const link = await request(app()).get(`/operator/auth/enroll/${token}`);
        expect(link.status).toBe(200);
        expect(link.headers['cache-control']).toBe('no-store');
        expect(link.body.qr).toMatch(/^<svg/);
        const password = 'a long operator password';

        const done = await request(app())
            .post(`/operator/auth/enroll/${token}`)
            .send({ password, code: totpCode(link.body.secret, totpStep()) });
        expect(done.status).toBe(200);
        expect(done.body.recoveryCodes).toHaveLength(10);
        expect((await request(app()).get(`/operator/auth/enroll/${token}`)).status).toBe(410);

        const wrong = await request(app())
            .post('/operator/auth/login')
            .send({ email: 'ops@moteur.io', password, code: '000000' });
        expect(wrong.status).toBe(401);
        const signedIn = await request(app())
            .post('/operator/auth/login')
            .send({ email: 'ops@moteur.io', password, code: done.body.recoveryCodes[0] });
        expect(signedIn.status).toBe(200);

        const secret = await request(app())
            .get('/operator/secret')
            .set('Authorization', `Bearer ${signedIn.body.token}`);
        expect(secret.body).toEqual({ operator: 'ops@moteur.io', actsAs: 'Ops (operator)' });
        const me = await request(app())
            .get('/operator/auth/me')
            .set('Authorization', `Bearer ${signedIn.body.token}`);
        expect(me.body.operator.email).toBe('ops@moteur.io');
    });
});

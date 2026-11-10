import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireOperator: (req: any, _res: any, next: () => void) => {
        req.operator = { id: 'op1', email: 'op@moteur.test' };
        req.user = { id: 'op1', name: 'Op', email: 'op@moteur.test' };
        next();
    }
}));

import operator from '../../src/operator/index.js';
import { loginUser } from '@moteurio/core/auth.js';
import { getUserByEmail, reloadUsers } from '@moteurio/core/users.js';

const app = express();
app.use(express.json());
app.use('/operator', operator);

const PASSWORD = 'correct-horse-battery-staple';

describe('operators managing accounts', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-operator-users-'));
        fs.mkdirSync(path.join(root, 'data/projects'), { recursive: true });
        fs.writeFileSync(path.join(root, 'data/users.json'), '[]');
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'data/users.json'));
        vi.stubEnv('PROJECTS_DIR', path.join(root, 'data/projects'));
        vi.stubEnv('JWT_SECRET', 'operator-users-test-secret-of-32-chars');
        reloadUsers();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('creates an account that can sign in with its password', async () => {
        const res = await request(app)
            .post('/operator/users')
            .send({ email: 'smoke@moteur.test', name: 'Smoke test', password: PASSWORD });
        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ email: 'smoke@moteur.test', name: 'Smoke test' });
        expect(res.body.user.passwordHash).toBeUndefined();
        const signedIn = await loginUser('smoke@moteur.test', PASSWORD);
        expect(signedIn).toBeTruthy();
    });

    it('creates an account without a password for email-code sign-in', async () => {
        const res = await request(app)
            .post('/operator/users')
            .send({ email: 'codes@moteur.test', name: 'Codes' });
        expect(res.status).toBe(201);
        expect(getUserByEmail('codes@moteur.test')?.passwordHash).toBeUndefined();
    });

    it('refuses a missing name, a weak password and an email already in use', async () => {
        const noName = await request(app).post('/operator/users').send({ email: 'a@moteur.test' });
        expect(noName.status).toBe(400);
        const weak = await request(app)
            .post('/operator/users')
            .send({ email: 'a@moteur.test', name: 'A', password: 'short' });
        expect(weak.status).toBe(400);
        expect(weak.body.code).toBe('password');
        await request(app).post('/operator/users').send({ email: 'a@moteur.test', name: 'A' });
        const again = await request(app)
            .post('/operator/users')
            .send({ email: 'A@moteur.test', name: 'A' });
        expect(again.status).toBe(409);
    });

    it('returns 404 when the project to add the account to does not exist', async () => {
        const res = await request(app)
            .post('/operator/users')
            .send({ email: 'b@moteur.test', name: 'B', projectId: 'nope' });
        expect(res.status).toBe(404);
        expect(getUserByEmail('b@moteur.test')).toBeUndefined();
    });

    it('sets a password, which ends the account’s sessions', async () => {
        const created = await request(app)
            .post('/operator/users')
            .send({ email: 'c@moteur.test', name: 'C' });
        const id = created.body.user.id as string;
        const before = getUserByEmail('c@moteur.test')?.authVersion ?? 0;

        const res = await request(app)
            .put(`/operator/users/${encodeURIComponent(id)}/password`)
            .send({ password: PASSWORD });
        expect(res.status).toBe(200);
        expect(getUserByEmail('c@moteur.test')?.authVersion).toBe(before + 1);
        expect(await loginUser('c@moteur.test', PASSWORD)).toBeTruthy();
    });

    it('refuses to set a weak password or one for an unknown account', async () => {
        const created = await request(app)
            .post('/operator/users')
            .send({ email: 'd@moteur.test', name: 'D' });
        const id = encodeURIComponent(created.body.user.id as string);
        expect(
            (await request(app).put(`/operator/users/${id}/password`).send({ password: 'x' }))
                .status
        ).toBe(400);
        expect(
            (await request(app).put('/operator/users/nobody/password').send({ password: PASSWORD }))
                .status
        ).toBe(404);
    });
});

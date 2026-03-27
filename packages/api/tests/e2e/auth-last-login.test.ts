import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../src/middlewares/rateLimit.js', () => ({
    loginRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next()
}));

describe('E2E: login then GET /auth/me includes lastLoginAt', () => {
    let tmpDir: string;
    let usersPath: string;
    let prevJwt: string | undefined;
    let prevUsersFile: string | undefined;

    beforeAll(async () => {
        prevJwt = process.env.JWT_SECRET;
        prevUsersFile = process.env.AUTH_USERS_FILE;
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-auth-e2e-'));
        usersPath = path.join(tmpDir, 'users.json');
        const { hashPassword } = await import('@moteurio/core/auth.js');
        const passwordHash = await hashPassword('testpass-e2e-99');
        await fs.writeFile(
            usersPath,
            JSON.stringify([
                {
                    id: 'user:e2e-lastlogin',
                    isActive: true,
                    email: 'e2e-lastlogin@test.local',
                    name: 'E2E LastLogin',
                    passwordHash,
                    roles: ['admin'],
                    projects: []
                }
            ]),
            'utf-8'
        );
        process.env.JWT_SECRET = 'test-jwt-secret-for-e2e-must-be-32chars';
        process.env.AUTH_USERS_FILE = usersPath;
    });

    afterAll(async () => {
        if (prevJwt === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = prevJwt;
        if (prevUsersFile === undefined) delete process.env.AUTH_USERS_FILE;
        else process.env.AUTH_USERS_FILE = prevUsersFile;
        const { reloadUsers } = await import('@moteurio/core/users.js');
        reloadUsers();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns lastLoginAt on login response and on /auth/me', async () => {
        const { reloadUsers } = await import('@moteurio/core/users.js');
        reloadUsers();

        const { default: loginRouter } = await import('../../src/auth/login.js');
        const { default: meRouter } = await import('../../src/auth/me.js');

        const app = express();
        app.use(express.json());
        app.use('/auth', loginRouter);
        app.use('/auth', meRouter);

        const loginRes = await request(app)
            .post('/auth/login')
            .send({ username: 'e2e-lastlogin@test.local', password: 'testpass-e2e-99' });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.token).toBeTruthy();
        expect(loginRes.body.user?.lastLoginAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        const lastLoginAt = loginRes.body.user.lastLoginAt as string;

        const meRes = await request(app)
            .get('/auth/me')
            .set('Authorization', `Bearer ${loginRes.body.token}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body.user?.lastLoginAt).toBe(lastLoginAt);
        expect(meRes.body.user).not.toHaveProperty('passwordHash');
    });
});

import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middlewares/rateLimit.js', () => {
    const pass = (_req: unknown, _res: unknown, next: () => void) => next();
    return { verificationRateLimiter: pass, loginRateLimiter: pass };
});

import { createAuthRouter } from '../../src/auth/index.js';
import { getUserById, reloadUsers } from '@moteurio/core/users.js';
import { generateSessionToken, hashPassword } from '@moteurio/core/auth.js';
import { beginTwoFactor, enableTwoFactor } from '@moteurio/core/twoFactor.js';
import { totpCode, totpStep } from '@moteurio/core/totp.js';
import { SoftAuthenticator } from '../../../core/tests/helpers/softAuthenticator.js';

const email = 'louise@journal.test';
const password = 'a long password';

const app = express();
app.use(express.json());
app.use('/auth', createAuthRouter());

describe('passkeys over the API (real engine, software authenticator)', () => {
    let root: string;
    let device: SoftAuthenticator;

    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-api-passkeys-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('JWT_SECRET', 'api-passkey-test');
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'd'.repeat(64));
        vi.stubEnv('STUDIO_URL', 'http://localhost:5180');
        vi.stubEnv('MOTEUR_EMAIL_CODES_TO_LOG', '1');
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                {
                    id: 'u1',
                    email,
                    name: 'Louise',
                    isActive: true,
                    roles: [],
                    projects: [],
                    passwordHash: await hashPassword(password)
                }
            ])
        );
        reloadUsers();
        device = new SoftAuthenticator();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

    async function passwordToken(): Promise<string> {
        const res = await request(app).post('/auth/login').send({ username: email, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    async function addPasskey(token: string, name?: string) {
        const start = await request(app).post('/auth/passkeys/register/options').set(bearer(token));
        expect(start.status).toBe(200);
        const res = await request(app)
            .post('/auth/passkeys/register/verify')
            .set(bearer(token))
            .set(
                'User-Agent',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'
            )
            .send({ response: device.create(start.body.options), name });
        return res;
    }

    async function passkeySignIn(body: object = {}) {
        const start = await request(app).post('/auth/passkeys/sign-in/options').send(body);
        expect(start.status).toBe(200);
        return request(app)
            .post('/auth/passkeys/sign-in/verify')
            .send({ response: device.get(start.body.options) });
    }

    it('says passkeys are on', async () => {
        const res = await request(app).get('/auth/signup');
        expect(res.body).toMatchObject({ passkeys: true });
    });

    it('adds, lists, renames and signs in with a passkey', async () => {
        const token = await passwordToken();
        const added = await addPasskey(token);
        expect(added.status).toBe(201);
        expect(added.headers['cache-control']).toBe('no-store');
        expect(added.body.passkey).toMatchObject({
            name: 'iCloud Keychain',
            synced: true,
            createdOn: 'Chrome on Windows'
        });
        const id = added.body.passkey.id;

        const listed = await request(app).get('/auth/passkeys').set(bearer(token));
        expect(listed.body).toEqual({ available: true, passkeys: [added.body.passkey] });

        const renamed = await request(app)
            .patch(`/auth/passkeys/${id}`)
            .set(bearer(token))
            .send({ name: 'Work laptop' });
        expect(renamed.body.passkey.name).toBe('Work laptop');

        const signedIn = await passkeySignIn();
        expect(signedIn.status).toBe(200);
        expect(signedIn.body.user).toMatchObject({ id: 'u1', passkeys: 1 });
        expect(signedIn.body.user).not.toHaveProperty('passwordHash');
        expect(JSON.stringify(signedIn.body)).not.toContain('publicKey');
        const me = await request(app).get('/auth/me').set(bearer(signedIn.body.token));
        expect(me.status).toBe(200);
        expect(me.body.user).not.toHaveProperty('passkeyUserId');
    });

    it('is for the person only, never an agent acting for them', async () => {
        const agentToken = generateSessionToken(
            { ...getUserById('u1')!, agent: { name: 'Claude', reviewOnly: true } },
            600
        );
        for (const res of [
            await request(app).get('/auth/passkeys').set(bearer(agentToken)),
            await request(app).post('/auth/passkeys/register/options').set(bearer(agentToken)),
            await request(app).delete('/auth/passkeys/any').set(bearer(agentToken))
        ])
            expect(res.status).toBe(403);
    });

    it('signs in with an email, and skips the app code', async () => {
        const { secret } = await beginTwoFactor('u1');
        await enableTwoFactor('u1', totpCode(secret, totpStep()));
        // Two-step is on: the password gives a ticket; the code makes the session.
        const ticket = (await request(app).post('/auth/login').send({ username: email, password }))
            .body.ticket;
        const session = await request(app)
            .post('/auth/two-factor/verify')
            .send({ ticket, code: totpCode(secret, totpStep() + 1) });
        expect(session.status).toBe(200);
        expect((await addPasskey(session.body.token)).status).toBe(201);

        const withEmail = await passkeySignIn({ email });
        expect(withEmail.status).toBe(200);
        expect(withEmail.body.token).toEqual(expect.any(String));
        expect(withEmail.body).not.toHaveProperty('twoFactor');

        // After a password, a passkey stands in for the code.
        const next = (await request(app).post('/auth/login').send({ username: email, password }))
            .body.ticket;
        const second = await passkeySignIn({ ticket: next });
        expect(second.status).toBe(200);
        expect(second.body.token).toEqual(expect.any(String));
    });

    it('asks for a recent sign-in to add or remove one, and removing ends sessions', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const token = await passwordToken();
        const id = (await addPasskey(token)).body.passkey.id;
        vi.advanceTimersByTime(11 * 60_000);

        const late = await request(app).delete(`/auth/passkeys/${id}`).set(bearer(token));
        expect(late.status).toBe(403);
        expect(late.body.code).toBe('REAUTH_REQUIRED');
        const lateAdd = await request(app)
            .post('/auth/passkeys/register/options')
            .set(bearer(token));
        expect(lateAdd.body.code).toBe('REAUTH_REQUIRED');
        // Renaming is no change to how one signs in.
        const rename = await request(app)
            .patch(`/auth/passkeys/${id}`)
            .set(bearer(token))
            .send({ name: 'Phone' });
        expect(rename.status).toBe(200);

        const fresh = (await passkeySignIn()).body.token;
        const removed = await request(app).delete(`/auth/passkeys/${id}`).set(bearer(fresh));
        expect(removed.status).toBe(200);
        expect((await request(app).get('/auth/passkeys').set(bearer(token))).status).toBe(401);
        const still = await request(app).get('/auth/passkeys').set(bearer(removed.body.token));
        expect(still.body.passkeys).toEqual([]);

        // The browser is told which passkey to forget.
        const unknown = await passkeySignIn();
        expect(unknown.status).toBe(401);
        expect(unknown.body).toMatchObject({
            code: 'PASSKEY_UNKNOWN',
            credentialId: id,
            rpId: 'localhost'
        });
    });

    it('refuses a missing answer, a replay, and a server without passkeys', async () => {
        const missing = await request(app).post('/auth/passkeys/sign-in/verify').send({});
        expect(missing.status).toBe(400);
        expect(missing.body.code).toBe('PASSKEY_INVALID');

        await addPasskey(await passwordToken());
        const start = await request(app).post('/auth/passkeys/sign-in/options').send({});
        const answer = device.get(start.body.options);
        expect(
            (await request(app).post('/auth/passkeys/sign-in/verify').send({ response: answer }))
                .status
        ).toBe(200);
        const replay = await request(app)
            .post('/auth/passkeys/sign-in/verify')
            .send({ response: answer });
        expect(replay.status).toBe(400);
        expect(replay.body.code).toBe('PASSKEY_EXPIRED');

        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('STUDIO_URL', '');
        const off = await request(app).post('/auth/passkeys/sign-in/options').send({});
        expect(off.status).toBe(404);
        expect(off.body.code).toBe('PASSKEYS_UNAVAILABLE');
        expect((await request(app).get('/auth/signup')).body.passkeys).toBe(false);
    });
});

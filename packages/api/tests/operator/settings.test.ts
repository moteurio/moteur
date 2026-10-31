import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireOperator: (req: any, _res: any, next: () => void) => {
        req.operator = { id: 'op1', email: 'op@moteur.test' };
        next();
    }
}));

import operator from '../../src/operator/index.js';

const app = express();
app.use(express.json());
app.use('/operator', operator);

describe('operator settings: legal links', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-op-settings-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('MOTEUR_PRIVACY_URL', 'https://www.moteur.io/privacy');
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('shows what is saved and what the environment gives, and changes it', async () => {
        expect((await request(app).get('/operator/settings')).body).toEqual({
            settings: {},
            env: { privacyUrl: 'https://www.moteur.io/privacy' }
        });
        const set = await request(app)
            .patch('/operator/settings')
            .send({ termsUrl: 'https://www.moteur.io/terms' });
        expect(set.status).toBe(200);
        expect(set.body.settings).toEqual({ termsUrl: 'https://www.moteur.io/terms' });
        const cleared = await request(app).patch('/operator/settings').send({ termsUrl: null });
        expect(cleared.body.settings).toEqual({});
    });

    it('refuses an address that is not https', async () => {
        for (const termsUrl of ['http://example.test/terms', 42]) {
            const res = await request(app).patch('/operator/settings').send({ termsUrl });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('URL_INVALID');
        }
        expect((await request(app).patch('/operator/settings').send({})).status).toBe(400);
    });
});

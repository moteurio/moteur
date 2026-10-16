import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { securityHeaders } from '../../src/middlewares/security.js';
import { mountStaticAssets } from '../../src/bootstrap/staticAssetsRoute.js';

describe('static assets route', () => {
    let root: string;
    let app: express.Express;

    beforeEach(() => {
        // A data root under a dot-directory, like ~/.moteur.
        root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-static-')), '.moteur');
        const dir = path.join(root, 'data', 'projects', 'p1', 'assets', 'thumb');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'a1.webp'), Buffer.from('RIFFxxxxWEBP'));
        vi.stubEnv('DATA_ROOT', root);
        app = express();
        app.use(securityHeaders);
        mountStaticAssets(app, '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(path.dirname(root), { recursive: true, force: true });
    });

    it('serves files even when the data root is under a dot-directory', async () => {
        const res = await request(app).get('/static/assets/p1/thumb/a1.webp');
        expect(res.status).toBe(200);
    });

    it('lets other origins embed media (sites, the Studio)', async () => {
        const res = await request(app).get('/static/assets/p1/thumb/a1.webp');
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('still refuses path traversal and missing files', async () => {
        expect(
            (await request(app).get('/static/assets/p1/thumb/..%2F..%2Fproject.json')).status
        ).toBe(400);
        expect((await request(app).get('/static/assets/p1/thumb/missing.webp')).status).toBe(404);
    });
});

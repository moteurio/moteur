import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { securityHeaders } from '../../src/middlewares/security.js';
import { mountResizedImages, mountStaticAssets } from '../../src/bootstrap/staticAssetsRoute.js';
import { getResizedImage, ResizeNotFound } from '@moteurio/core/assets/resize.js';
import { imageTraffic } from '@moteurio/core/metering.js';
import { requestClassifier } from '../../src/middlewares/requestClassifier.js';
import { usageLogging } from '../../src/middlewares/usageLogging.js';

vi.mock('@moteurio/core/assets/resize.js', async importOriginal => ({
    ...(await importOriginal<typeof import('@moteurio/core/assets/resize.js')>()),
    getResizedImage: vi.fn()
}));

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

    it('sends anything but media as a sandboxed download, never as a page', async () => {
        const dir = path.join(root, 'data', 'projects', 'p1', 'assets', 'original');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'x-page.html'), '<script>alert(1)</script>');
        const page = await request(app).get('/static/assets/p1/original/x-page.html');
        expect(page.headers['content-disposition']).toMatch(/^attachment/);
        expect(page.headers['content-security-policy']).toContain('sandbox');
        expect(page.headers['x-content-type-options']).toBe('nosniff');

        const image = await request(app).get('/static/assets/p1/thumb/a1.webp');
        expect(image.headers['content-disposition']).toBeUndefined();
        expect(image.headers['x-content-type-options']).toBe('nosniff');
    });

    it("counts files sent as the project's image traffic, a part of one too, not a revalidation", async () => {
        const counted = express();
        counted.use(requestClassifier, usageLogging);
        mountStaticAssets(counted, '');
        const first = await request(counted).get('/static/assets/p1/thumb/a1.webp');
        await request(counted)
            .get('/static/assets/p1/thumb/a1.webp')
            .set('If-None-Match', first.headers.etag);
        await request(counted).get('/static/assets/p1/thumb/a1.webp').set('Range', 'bytes=0-3');
        expect(imageTraffic('p1')).toEqual({ requests: 2, bytes: 12 + 4 });
    });

    it('serves files even when the data root is under a dot-directory', async () => {
        const res = await request(app).get('/static/assets/p1/thumb/a1.webp');
        expect(res.status).toBe(200);
    });

    it('lets other origins embed media (sites, the Studio)', async () => {
        const res = await request(app).get('/static/assets/p1/thumb/a1.webp');
        expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('lets caches keep versioned copies for good, unversioned ones for an hour', async () => {
        const versioned = await request(app).get('/static/assets/p1/thumb/a1.webp?v=mvax7fyc');
        expect(versioned.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        const old = await request(app).get('/static/assets/p1/thumb/a1.webp');
        expect(old.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('still refuses path traversal and missing files', async () => {
        expect(
            (await request(app).get('/static/assets/p1/thumb/..%2F..%2Fproject.json')).status
        ).toBe(400);
        expect((await request(app).get('/static/assets/p1/thumb/missing.webp')).status).toBe(404);
    });
});

describe('resized images route', () => {
    let app: express.Express;

    beforeEach(() => {
        app = express();
        mountResizedImages(app, '');
        vi.mocked(getResizedImage).mockReset();
    });

    it('serves the size with its type, cached for good when versioned', async () => {
        vi.mocked(getResizedImage).mockResolvedValue({
            buffer: Buffer.from('img'),
            format: 'avif',
            etag: '"tag1"'
        });
        const res = await request(app).get('/static/resize/p1/a1?w=600&ar=1:1&fmt=avif&v=abc');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/avif');
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        expect(res.headers.etag).toBe('"tag1"');
        // Asked again by a browser that has it: nothing to send.
        const again = await request(app)
            .get('/static/resize/p1/a1?w=600&ar=1:1&fmt=avif&v=abc')
            .set('If-None-Match', '"tag1"');
        expect(again.status).toBe(304);
        expect(again.headers['content-length'] ?? '0').toBe('0');
        expect(getResizedImage).toHaveBeenCalledWith('p1', 'a1', {
            width: 640,
            ratio: '1:1',
            format: 'avif'
        });
    });

    it("counts what it sends as the project's image traffic", async () => {
        const counted = express();
        counted.use(requestClassifier, usageLogging);
        mountResizedImages(counted, '');
        vi.mocked(getResizedImage).mockResolvedValue({
            buffer: Buffer.alloc(300),
            format: 'webp',
            etag: '"t"'
        });
        await request(counted).get('/static/resize/counted/a1?w=320');
        await request(counted).get('/static/resize/counted/a1?w=320').set('If-None-Match', '"t"');
        expect(imageTraffic('counted')).toEqual({ requests: 1, bytes: 300 });
    });

    it('asks to retry, uncached, when too many sizes are being made', async () => {
        vi.mocked(getResizedImage).mockRejectedValue(
            Object.assign(new Error('Server is busy. Try again shortly.'), {
                status: 429,
                code: 'WORK_CAPACITY'
            })
        );
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/static/resize/p1/a1?w=600');
        expect(res.status).toBe(503);
        expect(res.headers['retry-after']).toBe('2');
        expect(res.headers['cache-control']).toBe('no-store');
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it('explains bad requests and hides unknown images', async () => {
        const bad = await request(app).get('/static/resize/p1/a1?w=600&ar=5:4');
        expect(bad.status).toBe(400);
        expect(bad.body.error).toContain('"ar"');
        vi.mocked(getResizedImage).mockRejectedValue(new ResizeNotFound('Not found'));
        expect((await request(app).get('/static/resize/p1/nope?w=100')).status).toBe(404);
    });
});

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveGeneratedImageRouter } from '../src/routes/saveGeneratedImage.js';

vi.mock('axios', () => {
    return {
        default: {
            get: vi.fn()
        }
    };
});

vi.mock('@moteurio/core/projects.js', () => ({
    getProject: vi.fn()
}));

vi.mock('@moteurio/core/assets/assetService.js', () => ({
    uploadAsset: vi.fn()
}));

describe('saveGeneratedImage route', () => {
    const requireAuth = (req: any, _res: any, next: () => void) => {
        req.user = { id: 'u1' };
        next();
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 400 for invalid payload', async () => {
        const app = express();
        app.use(express.json());
        app.use(createSaveGeneratedImageRouter({ requireAuth } as any));

        const res = await request(app).post('/save-generated-image').send({ projectId: '' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid request');
    });

    it('returns 403 when user cannot access project', async () => {
        const { getProject } = await import('@moteurio/core/projects.js');
        vi.mocked(getProject).mockResolvedValue({
            users: ['another-user'],
            ai: { enabled: true }
        } as any);

        const app = express();
        app.use(express.json());
        app.use(createSaveGeneratedImageRouter({ requireAuth } as any));

        const res = await request(app).post('/save-generated-image').send({
            variantUrl: 'https://x.test/a.png',
            prompt: 'p',
            provider: 'mock',
            aspectRatio: '1:1',
            projectId: 'p1'
        });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('forbidden');
    });

    it('fetches image and stores asset successfully', async () => {
        const axios = (await import('axios')).default;
        const { getProject } = await import('@moteurio/core/projects.js');
        const { uploadAsset } = await import('@moteurio/core/assets/assetService.js');

        vi.mocked(getProject).mockResolvedValue({
            users: ['u1'],
            label: 'P',
            ai: { enabled: true }
        } as any);
        vi.mocked(axios.get).mockResolvedValue({
            data: Buffer.from('img'),
            headers: { 'content-type': 'image/png' }
        } as any);
        vi.mocked(uploadAsset).mockResolvedValue({
            id: 'asset1',
            url: 'http://cdn/asset1',
            localUrl: '/assets/asset1'
        } as any);

        const app = express();
        app.use(express.json());
        app.use(createSaveGeneratedImageRouter({ requireAuth } as any));

        const res = await request(app).post('/save-generated-image').send({
            variantUrl: 'https://x.test/a.png',
            prompt: 'prompt',
            provider: 'openai',
            aspectRatio: '1:1',
            projectId: 'p1',
            entryId: 'e1',
            fieldPath: 'hero.image'
        });

        expect(res.status).toBe(200);
        expect(res.body.asset.id).toBe('asset1');
        expect(res.body.asset.url).toBe('/assets/asset1');
        expect(res.body.entryId).toBe('e1');
        expect(res.body.fieldPath).toBe('hero.image');
    });
});

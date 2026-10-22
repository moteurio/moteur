import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveGeneratedModelRouter } from '../src/routes/saveGeneratedModel.js';

vi.mock('@moteurio/core/webhooks/webhookService.js', () => ({
    assertPublicHttpsUrl: vi.fn(async (url: string) => {
        if (!url.startsWith('https://')) throw new Error('Model URL must be HTTPS');
    })
}));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@moteurio/core/projects.js', () => ({ getProject: vi.fn() }));
vi.mock('@moteurio/core/assets/assetService.js', () => ({ uploadAsset: vi.fn() }));

import axios from 'axios';
import { getProject } from '@moteurio/core/projects.js';
import { uploadAsset } from '@moteurio/core/assets/assetService.js';

const on = { id: 'p1', ai: { helpers: { model3d: true } } } as any;
const app = () => {
    const a = express();
    a.use(express.json());
    a.use(
        createSaveGeneratedModelRouter({
            requireAuth: (req: any, _res: any, next: () => void) => {
                req.user = { id: 'u1', roles: ['writer'] };
                next();
            }
        } as any)
    );
    return a;
};

describe('save-generated-model route', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refuses when the 3D helper is off', async () => {
        vi.mocked(getProject).mockResolvedValue({ id: 'p1' } as any);
        const res = await request(app())
            .post('/save-generated-model')
            .send({ projectId: 'p1', url: 'https://assets.meshy.ai/m.glb' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('AI_HELPER_OFF');
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('never fetches an address that is not public HTTPS', async () => {
        vi.mocked(getProject).mockResolvedValue(on);
        const res = await request(app())
            .post('/save-generated-model')
            .send({ projectId: 'p1', url: 'http://169.254.169.254/latest' });
        expect(res.status).toBe(502);
        expect(res.body.code).toBe('FETCH_FAILED');
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('stores the model and its preview picture as generated assets', async () => {
        vi.mocked(getProject).mockResolvedValue(on);
        vi.mocked(axios.get).mockResolvedValue({ data: new Uint8Array([1, 2, 3]) } as any);
        vi.mocked(uploadAsset)
            .mockResolvedValueOnce({ id: 'a-model', url: '/m.glb', type: 'model' } as any)
            .mockResolvedValueOnce({ id: 'a-poster', url: '/p.png', type: 'image' } as any);
        const res = await request(app()).post('/save-generated-model').send({
            projectId: 'p1',
            url: 'https://assets.meshy.ai/m.glb',
            thumbnailUrl: 'https://assets.meshy.ai/p.png',
            prompt: 'A brass diving helmet',
            provider: 'meshy'
        });
        expect(res.status).toBe(200);
        expect(res.body.asset.id).toBe('a-model');
        expect(res.body.poster.id).toBe('a-poster');
        expect(axios.get).toHaveBeenCalledWith(
            'https://assets.meshy.ai/m.glb',
            expect.objectContaining({ maxRedirects: 0 })
        );
        const [, , file, options] = vi.mocked(uploadAsset).mock.calls[0];
        expect(file.mimeType).toBe('model/gltf-binary');
        expect(file.originalName).toMatch(/\.glb$/);
        expect(options).toMatchObject({
            aiGenerated: true,
            generationPrompt: 'A brass diving helmet'
        });
    });

    it('keeps the model when its preview picture fails', async () => {
        vi.mocked(getProject).mockResolvedValue(on);
        vi.mocked(axios.get)
            .mockResolvedValueOnce({ data: new Uint8Array([1]) } as any)
            .mockRejectedValueOnce(new Error('timeout'));
        vi.mocked(uploadAsset).mockResolvedValueOnce({ id: 'a-model', url: '/m.glb' } as any);
        const res = await request(app()).post('/save-generated-model').send({
            projectId: 'p1',
            url: 'https://assets.meshy.ai/m.glb',
            thumbnailUrl: 'https://assets.meshy.ai/p.png'
        });
        expect(res.status).toBe(200);
        expect(res.body.poster).toBeUndefined();
    });
});

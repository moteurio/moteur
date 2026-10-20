import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/assets/assetService.js', () => ({
    uploadAsset: vi.fn(),
    listAssets: vi.fn(),
    getAsset: vi.fn(),
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
    moveToFolder: vi.fn(),
    regenerateVariants: vi.fn()
}));

vi.mock('@moteurio/core/assets/assetUsage.js', () => ({ assetUsage: vi.fn() }));

import assetsRouter from '../../src/studio/assets/index.js';
import { getAsset } from '@moteurio/core/assets/assetService.js';
import { assetUsage } from '@moteurio/core/assets/assetUsage.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/assets', assetsRouter);

const cover = {
    kind: 'entry',
    modelId: 'article',
    entryId: 'ungava',
    title: 'Sous la glace',
    field: 'cover',
    path: 'cover'
};
const hero = { kind: 'page', pageId: 'home', title: 'Home', field: 'hero', path: 'hero' };

describe('Asset usage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (assetUsage as any).mockResolvedValue(
            new Map([
                ['a1', [cover, hero]],
                ['a2', [cover]]
            ])
        );
    });

    it('GET /usage counts uses per asset, without shadowing GET /:id', async () => {
        const res = await request(app).get('/projects/demo/assets/usage');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ counts: { a1: 2, a2: 1 } });
        expect(getAsset).not.toHaveBeenCalled();
    });

    it('GET /:id/usage lists the uses, or none', async () => {
        const res = await request(app).get('/projects/demo/assets/a1/usage');
        expect(res.status).toBe(200);
        expect(res.body.usages).toEqual([cover, hero]);
        const none = await request(app).get('/projects/demo/assets/a9/usage');
        expect(none.body).toEqual({ usages: [] });
    });
});

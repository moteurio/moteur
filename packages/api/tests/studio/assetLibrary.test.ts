import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    },
    requireProjectAdmin: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['admin'] };
        next();
    }
}));

vi.mock('@moteurio/core/assets/assetService.js', () => ({
    listAssets: vi.fn(async () => [{ id: 'a1' }]),
    listAssetPage: vi.fn(async (_p: string, _u: unknown, o: { limit: number; offset: number }) => ({
        assets: [],
        total: 0,
        offset: o.offset,
        limit: o.limit
    })),
    binAssets: vi.fn(async (_p: string, _u: unknown, ids: string[]) => ids.map(id => ({ id }))),
    restoreAssets: vi.fn(async (_p: string, _u: unknown, ids: string[]) => ids.map(id => ({ id }))),
    updateAssets: vi.fn(async (_p: string, _u: unknown, changes: { id: string; patch: object }[]) =>
        changes.map(c => ({ id: c.id, ...c.patch }))
    )
}));

import assetsRouter from '../../src/studio/assets/index.js';
import { binAssets, listAssetPage, updateAssets } from '@moteurio/core/assets/assetService.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/assets', assetsRouter);

const batch = (body: object) => request(app).post('/projects/demo/assets/batch').send(body);

describe('Asset library: batches and pages', () => {
    beforeEach(() => vi.clearAllMocks());

    it('bins and restores several', async () => {
        const res = await batch({ action: 'bin', ids: ['a1', 'a2'] });
        expect(res.status).toBe(200);
        expect(res.body.assets).toEqual([{ id: 'a1' }, { id: 'a2' }]);
        expect(binAssets).toHaveBeenCalledWith('demo', expect.anything(), ['a1', 'a2']);
        expect((await batch({ action: 'restore', ids: ['a1'] })).body.assets).toEqual([
            { id: 'a1' }
        ]);
    });

    it('moves several to a folder, or out of any', async () => {
        await batch({ action: 'move', ids: ['a1', 'a2'], folder: 'Menus' });
        expect(updateAssets).toHaveBeenCalledWith('demo', expect.anything(), [
            { id: 'a1', patch: { folder: 'Menus' } },
            { id: 'a2', patch: { folder: 'Menus' } }
        ]);
        const out = await batch({ action: 'move', ids: ['a1'], folder: '' });
        expect(out.body.assets).toEqual([{ id: 'a1', folder: null }]);
        expect((await batch({ action: 'move', ids: ['a1'] })).status).toBe(400);
    });

    it('writes each asset its own texts', async () => {
        const changes = [
            { id: 'a1', patch: { alt: { en: 'Lunch' } } },
            { id: 'a2', patch: { alt: { en: 'Dinner' } } }
        ];
        const res = await batch({ action: 'update', changes });
        expect(res.status).toBe(200);
        expect(updateAssets).toHaveBeenCalledWith('demo', expect.anything(), changes);
        expect((await batch({ action: 'update', changes: [{ id: 'a1' }] })).status).toBe(400);
    });

    it('refuses an unknown action, and passes on core errors', async () => {
        expect((await batch({ action: 'shred', ids: ['a1'] })).status).toBe(400);
        (binAssets as any).mockRejectedValueOnce(new Error('Asset "x" not found'));
        expect((await batch({ action: 'bin', ids: ['x'] })).status).toBe(404);
        (updateAssets as any).mockRejectedValueOnce(new Error('"alt" must be text.'));
        expect((await batch({ action: 'update', changes: [{ id: 'a', patch: {} }] })).status).toBe(
            400
        );
    });

    it('pages the list when asked, and keeps the plain list otherwise', async () => {
        expect((await request(app).get('/projects/demo/assets')).body).toEqual([{ id: 'a1' }]);
        const res = await request(app).get(
            '/projects/demo/assets?limit=50&offset=100&type=unused&folder=&search=gaspe&facets=1'
        );
        expect(res.status).toBe(200);
        expect(listAssetPage).toHaveBeenCalledWith('demo', expect.anything(), {
            kind: 'unused',
            folder: '',
            search: 'gaspe',
            limit: 50,
            offset: 100,
            facets: true
        });
        expect((await request(app).get('/projects/demo/assets?limit=0')).status).toBe(400);
        expect((await request(app).get('/projects/demo/assets?limit=5&offset=-1')).status).toBe(
            400
        );
        expect((await request(app).get('/projects/demo/assets?limit=5&type=zip')).status).toBe(400);
    });
});

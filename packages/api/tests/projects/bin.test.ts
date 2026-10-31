import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'b1', roles: ['builder'] };
        next();
    }
}));

vi.mock('@moteurio/core/contentBinService.js', () => ({
    listContentBin: vi.fn(),
    restoreFromContentBin: vi.fn(),
    deleteFromContentBin: vi.fn(),
    emptyContentBin: vi.fn()
}));

import binRoute from '../../src/projects/bin';
import {
    deleteFromContentBin,
    listContentBin,
    restoreFromContentBin
} from '@moteurio/core/contentBinService.js';

const app = express();
app.use(express.json());
app.use('/projects', binRoute);

const statusError = (message: string, statusCode: number) =>
    Object.assign(new Error(message), { statusCode });

describe('the bin, for a deleted model', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists a model with how many entries went with it', async () => {
        const item = {
            id: 'model.post.1',
            kind: 'model',
            modelId: 'post',
            binned: { at: '2026-10-30T00:00:00.000Z', by: 'b1' },
            model: { id: 'post', label: 'Post' },
            entryCount: 3
        };
        vi.mocked(listContentBin).mockResolvedValue([item] as never);
        const res = await request(app).get('/projects/site/bin');
        expect(res.status).toBe(200);
        expect(res.body.items).toEqual([item]);
    });

    it('takes a model out with its entries', async () => {
        vi.mocked(restoreFromContentBin).mockResolvedValue({
            kind: 'model',
            model: { id: 'post' },
            entryCount: 3
        } as never);
        const res = await request(app).post('/projects/site/bin/model.post.1/restore');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ kind: 'model', model: { id: 'post' }, entryCount: 3 });
        expect(restoreFromContentBin).toHaveBeenCalledWith(
            'site',
            { id: 'b1', roles: ['builder'] },
            'model.post.1'
        );
    });

    it('answers 409 when another model has its id now', async () => {
        vi.mocked(restoreFromContentBin).mockRejectedValue(
            statusError('Another model has the id "post" now. Rename or delete it first.', 409)
        );
        const res = await request(app).post('/projects/site/bin/model.post.1/restore');
        expect(res.status).toBe(409);
        expect(res.body.error).toContain('Another model has the id "post"');
    });

    it('answers 403 when deleting a model for good is not theirs to do', async () => {
        vi.mocked(deleteFromContentBin).mockRejectedValue(
            statusError('Only a content lead or an admin can delete content for good.', 403)
        );
        const res = await request(app).delete('/projects/site/bin/model.post.1');
        expect(res.status).toBe(403);
    });
});

import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import entriesRoute from '../../src/entries/getAll';

vi.mock('@moteurio/core/entries', () => ({
    queryEntries: vi.fn()
}));

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'mock-user' };
        next();
    }
}));

const app = express();
app.use(express.json());
app.use('/projects/:projectId/models/:modelId/entries', entriesRoute);

describe('GET /projects/:projectId/models/:modelId/entries', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { queryEntries } = await import('@moteurio/core/entries');
        (queryEntries as any).mockResolvedValue({
            items: [{ id: 'entry1' }, { id: 'entry2' }],
            total: 2
        });
    });

    it('should return entries if projectId and modelId are present', async () => {
        const res = await request(app).get('/projects/demo/models/article/entries');

        expect(res.status).toBe(200);
        expect(res.body.entries).toBeInstanceOf(Array);
        expect(res.body.entries.length).toBe(2);
        expect(res.body.total).toBe(2);
    });

    it('passes status, limit, offset and sort to the query', async () => {
        const { queryEntries } = await import('@moteurio/core/entries');
        const res = await request(app).get(
            '/projects/demo/models/article/entries?status=draft,in_review&limit=20&offset=40&sort=-updatedAt'
        );
        expect(res.status).toBe(200);
        expect(queryEntries).toHaveBeenCalledWith({ id: 'mock-user' }, 'demo', 'article', {
            status: ['draft', 'in_review'],
            limit: 20,
            offset: 40,
            sort: { field: 'updatedAt', direction: 'desc' }
        });
    });

    it('rejects an unknown status with 400', async () => {
        const res = await request(app).get('/projects/demo/models/article/entries?status=live');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/live/);
    });

    it('should return 500 if queryEntries throws', async () => {
        const { queryEntries } = await import('@moteurio/core/entries');
        (queryEntries as any).mockRejectedValueOnce(new Error('mock failure'));

        const res = await request(app).get('/projects/demo/models/failing/entries');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error');
    });
});

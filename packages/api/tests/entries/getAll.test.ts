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

    it('passes list parameters (search, filters, languages, sort, group, counts, fields)', async () => {
        const { queryEntries } = await import('@moteurio/core/entries');
        (queryEntries as any).mockResolvedValue({
            items: [],
            total: 7,
            facets: { issue: { 'nº-05': 4 } },
            missingCounts: { en: 2 }
        });
        const res = await request(app).get('/projects/demo/models/article/entries').query({
            q: 'glace',
            'filter.issue': 'nº-05,nº-06',
            'filter.$workflow': 'edits',
            missing: 'title:en',
            sort: '-data.title',
            sortLocale: 'fr',
            group: 'issue',
            groupOrder: 'nº-06,nº-05',
            facets: 'issue,$workflow',
            missingCounts: 'title:fr,en',
            fields: 'title,cover',
            limit: '0'
        });
        expect(res.status).toBe(200);
        expect(queryEntries).toHaveBeenCalledWith({ id: 'mock-user' }, 'demo', 'article', {
            limit: 0,
            sort: { field: 'data', key: 'title', locale: 'fr', direction: 'desc' },
            search: 'glace',
            filters: { issue: ['nº-05', 'nº-06'], $workflow: ['edits'] },
            missing: { field: 'title', locales: ['en'] },
            missingCounts: { field: 'title', locales: ['fr', 'en'] },
            group: { key: 'issue', order: ['nº-06', 'nº-05'] },
            facets: ['issue', '$workflow'],
            fields: ['title', 'cover']
        });
        expect(res.body).toEqual({
            entries: [],
            total: 7,
            facets: { issue: { 'nº-05': 4 } },
            missingCounts: { en: 2 }
        });
    });

    it.each([
        ['a field name that is not one', { 'filter.a.b': 'x' }],
        ['missing without languages', { missing: 'title' }],
        ['a sort on an unknown audit date', { sort: 'deletedAt' }],
        ['facets with a path', { facets: 'data.title' }]
    ])('rejects %s with 400', async (_label, query) => {
        const res = await request(app).get('/projects/demo/models/article/entries').query(query);
        expect(res.status).toBe(400);
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

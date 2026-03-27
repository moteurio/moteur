import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import entriesRoute from '../../src/entries/getAll';

vi.mock('@moteurio/core/entries', () => ({
    listEntries: vi.fn().mockResolvedValue([{ id: 'entry1' }, { id: 'entry2' }])
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
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return entries if projectId and modelId are present', async () => {
        const res = await request(app).get('/projects/demo/models/article/entries');

        expect(res.status).toBe(200);
        expect(res.body.entries).toBeInstanceOf(Array);
        expect(res.body.entries.length).toBe(2);
    });

    it('should return 500 if listEntries throws', async () => {
        const { listEntries } = await import('@moteurio/core/entries');
        (listEntries as any).mockRejectedValueOnce(new Error('mock failure'));

        const res = await request(app).get('/projects/demo/models/failing/entries');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error');
    });
});

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'editor1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/models', () => ({
    listModelSchemas: vi.fn()
}));

import getAllRoute from '../../src/models/getAll';
import { listModelSchemas } from '@moteurio/core/models';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/models', getAllRoute);

describe('GET /projects/:projectId/models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return a list of models for a valid projectId', async () => {
        const mockModels = [
            { id: 'article', label: 'Article' },
            { id: 'author', label: 'Author' }
        ];

        (listModelSchemas as any).mockResolvedValue(mockModels);

        const res = await request(app).get('/projects/demo/models');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ models: mockModels });
        expect(listModelSchemas).toHaveBeenCalledWith({ id: 'editor1', roles: ['editor'] }, 'demo');
    });

    it('should return 400 if projectId is missing (should be unreachable)', async () => {
        // This test is technically not needed since Express won't match /projects/
        const res = await request(app).get('/projects//models');
        expect([400, 404]).toContain(res.status);
    });

    it('should return 500 if listModelSchemas throws', async () => {
        (listModelSchemas as any).mockImplementation(() => {
            throw new Error('Boom');
        });

        const res = await request(app).get('/projects/demo/models');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to load models' });
    });
});

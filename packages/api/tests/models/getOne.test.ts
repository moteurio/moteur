import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/models', () => ({
    getModelSchema: vi.fn()
}));

import getOneRoute from '../../src/models/getOne';
import { getModelSchema } from '@moteurio/core/models';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/models', getOneRoute);

describe('GET /projects/:projectId/models/:modelId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return a model schema if found', async () => {
        const mockModel = {
            id: 'article',
            label: 'Article',
            fields: {
                title: { type: 'core/text' }
            }
        };

        (getModelSchema as any).mockReturnValue(mockModel);

        const res = await request(app).get('/projects/demo/models/article');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ model: mockModel });
        expect(getModelSchema).toHaveBeenCalledWith(
            { id: 'user1', roles: ['editor'] },
            'demo',
            'article'
        );
    });

    it('should return 404 if model is not found', async () => {
        (getModelSchema as any).mockReturnValue(null);

        const res = await request(app).get('/projects/demo/models/missing-model');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Model not found' });
    });

    it('should return 500 if an error is thrown', async () => {
        (getModelSchema as any).mockImplementation(() => {
            throw new Error('Boom');
        });

        const res = await request(app).get('/projects/demo/models/broken-model');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to get model' });
    });
});

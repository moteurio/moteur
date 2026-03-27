import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

vi.mock('@moteurio/core/models', () => ({
    updateModelSchema: vi.fn()
}));

vi.mock('@moteurio/core/validators/validateModel', () => ({
    validateModel: vi.fn()
}));

import updateRoute from '../../src/models/update';
import { updateModelSchema } from '@moteurio/core/models';
import { validateModel } from '@moteurio/core/validators/validateModel';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/models', updateRoute);

describe('PATCH /projects/:projectId/models/:modelId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const updatePayload = {
        id: 'article',
        label: 'Updated Article',
        description: 'Updated content',
        fields: {
            title: { type: 'core/text' },
            content: { type: 'core/rich-text' }
        },
        meta: {}
    };

    it('should update a model and return 200', async () => {
        (validateModel as any).mockReturnValue({ valid: true });
        (updateModelSchema as any).mockReturnValue({ ...updatePayload, updatedAt: Date.now() });

        const res = await request(app).patch('/projects/demo/models/article').send(updatePayload);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject(updatePayload);
        expect(validateModel).toHaveBeenCalledWith(updatePayload);
        expect(updateModelSchema).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            'demo',
            'article',
            updatePayload
        );
    });

    it('should return 400 if projectId or modelId is missing (bad path)', async () => {
        const res1 = await request(app).patch('/projects//models/article').send(updatePayload);
        const res2 = await request(app).patch('/projects/demo/models/').send(updatePayload);

        expect([400, 404]).toContain(res1.status);
        expect([400, 404]).toContain(res2.status);
    });

    it('should return 400 on validation error', async () => {
        (validateModel as any).mockReturnValue({
            valid: false,
            issues: [{ path: 'label', message: 'Label is required' }]
        });

        const res = await request(app)
            .patch('/projects/demo/models/article')
            .send({ ...updatePayload, label: '' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            error: 'Validation failed',
            validation: [{ path: 'label', message: 'Label is required' }]
        });
    });

    it('should return 500 if updateModelSchema throws unexpectedly', async () => {
        (validateModel as any).mockReturnValue({ valid: true });
        (updateModelSchema as any).mockImplementation(() => {
            throw new Error('Model update failed');
        });

        const res = await request(app).patch('/projects/demo/models/article').send(updatePayload);

        expect(res.status).toBe(500);
        expect(res.body.error).toBeDefined();
    });
});

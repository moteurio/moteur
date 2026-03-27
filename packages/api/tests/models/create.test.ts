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
    createModelSchema: vi.fn()
}));

vi.mock('@moteurio/core/validators/validateModel', () => ({
    validateModel: vi.fn()
}));

import createRoute from '../../src/models/create';
import { createModelSchema } from '@moteurio/core/models';
import { validateModel } from '@moteurio/core/validators/validateModel';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/models', createRoute);

describe('POST /projects/:projectId/models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const validModel = {
        id: 'article',
        label: 'Article',
        description: 'A blog post',
        fields: {
            title: { type: 'core/text' },
            body: { type: 'core/rich-text' }
        },
        meta: {}
    };

    it('should create a model successfully', async () => {
        (validateModel as any).mockReturnValue({ valid: true });
        (createModelSchema as any).mockReturnValue({ ...validModel, createdAt: Date.now() });

        const res = await request(app).post('/projects/demo/models').send(validModel);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject(validModel);
        expect(validateModel).toHaveBeenCalledWith(validModel);
        expect(createModelSchema).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            'demo',
            validModel
        );
    });

    it('should return 400 if projectId is missing (invalid path)', async () => {
        const res = await request(app).post('/projects//models').send(validModel);
        expect([400, 404]).toContain(res.status);
    });

    it('should return 400 if validation fails', async () => {
        (validateModel as any).mockReturnValue({
            valid: false,
            issues: [
                { path: 'id', message: 'Must be lowercase' },
                { path: 'label', message: 'Required' }
            ]
        });

        const res = await request(app)
            .post('/projects/demo/models')
            .send({ ...validModel, id: 'INVALID' });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
            error: 'Validation failed',
            validation: [
                { path: 'id', message: 'Must be lowercase' },
                { path: 'label', message: 'Required' }
            ]
        });
    });

    it('should return 500 if createModelSchema throws unexpectedly', async () => {
        (validateModel as any).mockReturnValue({ valid: true });
        (createModelSchema as any).mockImplementation(() => {
            throw new Error('Boom');
        });

        const res = await request(app).post('/projects/demo/models').send(validModel);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Boom');
    });
});

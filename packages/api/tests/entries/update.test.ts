import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'editor1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

import request from 'supertest';
import express from 'express';
import updateRoute from '../../src/entries/update';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { getModelSchema } from '@moteurio/core/models';
import { updateEntry } from '@moteurio/core/entries';
import { validateEntry } from '@moteurio/core/validators/validateEntry';

vi.mock('@moteurio/core/models', () => ({
    getModelSchema: vi.fn()
}));
vi.mock('@moteurio/core/entries', () => ({
    updateEntry: vi.fn()
}));
vi.mock('@moteurio/core/validators/validateEntry', () => ({
    validateEntry: vi.fn()
}));

const mockUser = { id: 'user-123', roles: [OPERATOR_ROLE_SLUG] };
const mockSchema = {
    id: 'article',
    label: 'Article',
    fields: { title: { type: 'core/text' } }
};

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
    req.user = mockUser;
    next();
});
app.use('/projects/:projectId/models/:modelId/entries', updateRoute);

describe('PATCH /projects/:projectId/models/:modelId/entries/:entryId', () => {
    const basePath = '/projects/test-project/models/article/entries/entry-1';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should update an entry and return 200', async () => {
        (getModelSchema as any).mockReturnValue(mockSchema);
        (validateEntry as any).mockResolvedValue({ valid: true });
        (updateEntry as any).mockResolvedValue({ id: 'entry-1', title: 'Updated Title' });

        const res = await request(app).patch(basePath).send({ title: 'Updated Title' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: 'entry-1', title: 'Updated Title' });
    });

    it('should return 400 if path params are missing', async () => {
        const res = await request(app).patch('/projects///entries/').send({});
        expect([400, 404]).toContain(res.status); // Allow both if route not matched
    });

    it('should return 404 if model schema is not found', async () => {
        (getModelSchema as any).mockReturnValue(null);
        const res = await request(app).patch(basePath).send({});
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Model not found');
    });

    it('should return 400 if entry validation fails', async () => {
        (getModelSchema as any).mockReturnValue(mockSchema);
        (validateEntry as any).mockResolvedValue({
            valid: false,
            issues: [{ path: 'title', message: 'Required' }]
        });

        const res = await request(app).patch(basePath).send({});

        expect(res.status).toBe(400);
        expect(res.body.valid).toBe(false);
        expect(res.body.errors[0].field).toBe('title');
    });

    it('should return 500 on unexpected update error', async () => {
        (getModelSchema as any).mockReturnValue(mockSchema);
        (validateEntry as any).mockResolvedValue({ valid: true });
        (updateEntry as any).mockRejectedValue(new Error('fail'));

        const res = await request(app).patch(basePath).send({ title: 'Fail' });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('fail');
    });
});

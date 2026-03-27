import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    },
    optionalProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/templates.js', () => ({
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    getTemplateWithAuth: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    validateTemplateById: vi.fn()
}));

import templatesRouter from '../../src/studio/templates/index.js';
import {
    listTemplates,
    getTemplateWithAuth,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    validateTemplateById
} from '@moteurio/core/templates.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/templates', templatesRouter);

const base = '/projects/demo/templates';

describe('Templates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET / should return list of templates', async () => {
        const mockList = [
            {
                id: 't1',
                label: 'Landing',
                projectId: 'demo',
                fields: {},
                createdAt: '',
                updatedAt: ''
            }
        ];
        (listTemplates as any).mockResolvedValue(mockList);

        const res = await request(app).get(base);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockList);
        expect(listTemplates).toHaveBeenCalledWith('demo');
    });

    it('GET /:id should return template', async () => {
        const mockTemplate = {
            id: 't1',
            label: 'Landing',
            projectId: 'demo',
            fields: {},
            createdAt: '',
            updatedAt: ''
        };
        (getTemplateWithAuth as any).mockResolvedValue(mockTemplate);

        const res = await request(app).get(`${base}/t1`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockTemplate);
        expect(getTemplateWithAuth).toHaveBeenCalledWith(expect.any(Object), 'demo', 't1');
    });

    it('GET /:id should return 404 when not found', async () => {
        (getTemplateWithAuth as any).mockRejectedValue(new Error('Template "x" not found'));

        const res = await request(app).get(`${base}/x`);

        expect(res.status).toBe(404);
    });

    it('POST / should create template and return 201', async () => {
        const body = { id: 't1', label: 'Landing', projectId: 'demo', fields: {} };
        const created = { ...body, createdAt: '', updatedAt: '' };
        (createTemplate as any).mockResolvedValue(created);

        const res = await request(app).post(base).send(body);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: 't1', label: 'Landing' });
        expect(createTemplate).toHaveBeenCalledWith(
            'demo',
            expect.any(Object),
            expect.objectContaining({ id: 't1', label: 'Landing' })
        );
    });

    it('PATCH /:id should update template', async () => {
        const updated = {
            id: 't1',
            label: 'Updated',
            projectId: 'demo',
            fields: {},
            createdAt: '',
            updatedAt: ''
        };
        (updateTemplate as any).mockResolvedValue(updated);

        const res = await request(app).patch(`${base}/t1`).send({ label: 'Updated' });

        expect(res.status).toBe(200);
        expect(res.body.label).toBe('Updated');
        expect(updateTemplate).toHaveBeenCalledWith('demo', expect.any(Object), 't1', {
            label: 'Updated'
        });
    });

    it('DELETE /:id should return 204', async () => {
        (deleteTemplate as any).mockResolvedValue(undefined);

        const res = await request(app).delete(`${base}/t1`);

        expect(res.status).toBe(204);
        expect(deleteTemplate).toHaveBeenCalledWith('demo', expect.any(Object), 't1');
    });

    it('POST /:id/validate should return validation result', async () => {
        (validateTemplateById as any).mockResolvedValue({ valid: true, issues: [] });

        const res = await request(app).post(`${base}/t1/validate`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ valid: true, issues: [] });
        expect(validateTemplateById).toHaveBeenCalledWith('demo', 't1');
    });
});

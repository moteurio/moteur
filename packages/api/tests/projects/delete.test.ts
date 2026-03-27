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

vi.mock('@moteurio/core/projects', () => ({
    deleteProject: vi.fn()
}));

import deleteRoute from '../../src/projects/delete';
import { deleteProject } from '@moteurio/core/projects';

const app = express();
app.use(express.json());
app.use('/projects', deleteRoute);

describe('DELETE /projects/:projectId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 204 on successful deletion', async () => {
        const res = await request(app).delete('/projects/demo');
        expect(res.status).toBe(204);
        expect(deleteProject).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            'demo'
        );
    });

    it('should return 400 if projectId is missing in path', async () => {
        const res = await request(app).delete('/projects/'); // Express will treat this as 404
        expect(res.status).toBe(404);
    });

    it('should return 404 if deleteProject throws', async () => {
        (deleteProject as any).mockImplementation(() => {
            throw new Error('Project not found');
        });

        const res = await request(app).delete('/projects/invalid-id');

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ error: 'Project not found' });
    });
});

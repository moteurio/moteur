import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock middlewares and dependencies
vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] }; // minimal fake operator
        next();
    }
}));

vi.mock('@moteurio/core/projects', () => ({
    listProjects: vi.fn()
}));

import projectRoutes from '../../src/projects/getAll';
import { listProjects } from '@moteurio/core/projects';

const app = express();
app.use(express.json());
app.use('/projects', projectRoutes);

describe('GET /projects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return a list of projects for an operator user', async () => {
        const mockProjects = [
            { id: 'site1', label: 'My First Project', description: 'Demo project' },
            { id: 'docs', label: 'Docs', description: 'Static content' }
        ];
        (listProjects as any).mockReturnValue(mockProjects);

        const res = await request(app).get('/projects');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ projects: mockProjects });
        expect(listProjects).toHaveBeenCalledWith({ id: 'op1', roles: [OPERATOR_ROLE_SLUG] });
    });
});

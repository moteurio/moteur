import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

vi.mock('@moteurio/core/projects', () => ({
    createProjectFromBlueprint: vi.fn()
}));

vi.mock('@moteurio/core/validators/validateProject', () => ({
    validateProject: vi.fn()
}));

import createRoute from '../../src/projects/create';
import { createProjectFromBlueprint } from '@moteurio/core/projects';
import { validateProject } from '@moteurio/core/validators/validateProject';

const app = express();
app.use(express.json());
app.use('/projects', createRoute);

describe('POST /projects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const validBody = {
        id: 'demo',
        label: 'Demo Project',
        description: 'A test project',
        defaultLocale: 'en',
        locale: 'en',
        modules: ['core'],
        plugins: []
    };

    it('should create a project and return 201', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (createProjectFromBlueprint as any).mockResolvedValue({
            project: { ...validBody, createdAt: Date.now() }
        });

        const res = await request(app).post('/projects').send(validBody);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject(validBody);
        expect(validateProject).toHaveBeenCalledWith(validBody);
        expect(createProjectFromBlueprint).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            validBody,
            undefined
        );
    });

    it('should pass blueprintId to createProjectFromBlueprint when provided', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (createProjectFromBlueprint as any).mockResolvedValue({
            project: { ...validBody, id: 'demo', label: 'Demo Project' }
        });

        const res = await request(app)
            .post('/projects')
            .send({ ...validBody, blueprintId: 'blog' });

        expect(res.status).toBe(201);
        expect(validateProject).toHaveBeenCalledWith(validBody);
        expect(createProjectFromBlueprint).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            validBody,
            'blog'
        );
    });

    it('should pass git.remoteUrl in body to createProjectFromBlueprint', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (createProjectFromBlueprint as any).mockResolvedValue({
            project: {
                ...validBody,
                git: { remoteUrl: 'https://github.com/org/repo.git' }
            }
        });

        const bodyWithRemote = {
            ...validBody,
            git: { remoteUrl: 'https://github.com/org/repo.git' }
        };
        const res = await request(app).post('/projects').send(bodyWithRemote);

        expect(res.status).toBe(201);
        expect(validateProject).toHaveBeenCalledWith(bodyWithRemote);
        expect(createProjectFromBlueprint).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            bodyWithRemote,
            undefined
        );
    });

    it('should return 400 on validation failure', async () => {
        (validateProject as any).mockReturnValue({
            valid: false,
            issues: [
                { path: 'label', message: 'Label is required' },
                { path: 'id', message: 'ID must be lowercase' }
            ]
        });

        const res = await request(app)
            .post('/projects')
            .send({ ...validBody, id: 'INVALID_ID' });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
            error: 'Validation failed',
            validation: [
                { path: 'label', message: 'Label is required' },
                { path: 'id', message: 'ID must be lowercase' }
            ]
        });
    });

    it('should return 500 on unexpected error', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (createProjectFromBlueprint as any).mockImplementation(() => {
            throw new Error('Something went wrong');
        });

        const res = await request(app).post('/projects').send(validBody);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Something went wrong');
    });
});

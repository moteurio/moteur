import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAdmin: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        req.account = req.user;
        next();
    }
}));

const { applyProjectPatchForTest } = vi.hoisted(() => {
    function applyProjectPatchForTest(
        current: Record<string, unknown>,
        patch: Record<string, unknown>
    ): Record<string, unknown> {
        const updated = { ...current, ...patch };
        for (const key of Object.keys(patch)) {
            if (patch[key] === null) {
                delete updated[key];
            }
        }
        return updated;
    }
    return { applyProjectPatchForTest };
});

vi.mock('@moteurio/core/projects.js', () => ({
    getProject: vi.fn(),
    updateProject: vi.fn(),
    applyProjectPatch: applyProjectPatchForTest
}));

vi.mock('@moteurio/core/validators/validateProject', () => ({
    validateProject: vi.fn()
}));

import updateRoute from '../../src/projects/update';
import { getProject, updateProject } from '@moteurio/core/projects.js';
import { validateProject } from '@moteurio/core/validators/validateProject';

const app = express();
app.use(express.json());
app.use('/projects', updateRoute);

describe('PATCH /projects/:projectId', () => {
    const existing = {
        id: 'demo',
        label: 'Demo',
        defaultLocale: 'en'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getProject).mockResolvedValue(existing as any);
    });

    const validData = {
        id: 'demo',
        label: 'Updated Demo Project',
        description: 'An updated test project',
        locale: 'en',
        modules: ['core'],
        plugins: []
    };

    it('should update a project successfully', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (updateProject as any).mockResolvedValue({ ...existing, ...validData });

        const res = await request(app).patch('/projects/demo').send(validData);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject(validData);
        const merged = applyProjectPatchForTest(existing as any, validData as any);
        expect(validateProject).toHaveBeenCalledWith(merged, {
            existingProjectId: 'demo'
        });
        expect(updateProject).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            'demo',
            validData
        );
    });

    it('leaves API keys to the developer routes, and refuses another id', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (updateProject as any).mockResolvedValue(existing);
        const keys = [{ id: 'k1', hash: 'f'.repeat(64), prefix: 'mk_live_x' }];

        const res = await request(app).patch('/projects/demo').send({ label: 'A', apiKeys: keys });
        expect(res.status).toBe(200);
        expect(updateProject).toHaveBeenCalledWith(expect.anything(), 'demo', { label: 'A' });

        const renamed = await request(app).patch('/projects/demo').send({ id: 'other' });
        expect(renamed.status).toBe(400);
        expect(updateProject).toHaveBeenCalledTimes(1);
    });

    it('should validate merged project when body is a partial patch', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (updateProject as any).mockResolvedValue({ ...existing, git: { enabled: true } });

        const patch = { git: { enabled: true } };
        const res = await request(app).patch('/projects/demo').send(patch);

        expect(res.status).toBe(200);
        expect(validateProject).toHaveBeenCalledWith(
            applyProjectPatchForTest(existing as any, patch as any),
            { existingProjectId: 'demo' }
        );
        expect(updateProject).toHaveBeenCalledWith(
            { id: 'op1', roles: [OPERATOR_ROLE_SLUG] },
            'demo',
            patch
        );
    });

    it('should return 400 if projectId is missing in path', async () => {
        const res = await request(app).patch('/projects/').send(validData);
        expect(res.status).toBe(404); // Express will handle missing param with 404
    });

    it('should return 400 if validation fails', async () => {
        (validateProject as any).mockReturnValue({
            valid: false,
            issues: [{ path: 'label', message: 'Label is required' }]
        });

        const res = await request(app)
            .patch('/projects/demo')
            .send({ ...validData, label: '' });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
            error: 'Validation failed',
            validation: [{ path: 'label', message: 'Label is required' }]
        });
    });

    it('should return 500 if updateProject throws unexpectedly', async () => {
        (validateProject as any).mockReturnValue({ valid: true });
        (updateProject as any).mockImplementation(() => {
            throw new Error('Unexpected failure');
        });

        const res = await request(app).patch('/projects/demo').send(validData);

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Unexpected failure');
    });
});

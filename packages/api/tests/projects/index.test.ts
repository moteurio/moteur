import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi } from 'vitest';

import projectsRouter, { projectsSpecs } from '../../src/projects';

// fake middleware override to inject user; pass-through for collection/auth middlewares
vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    optionalAuth: (_req: any, _res: any, next: any) => next(),
    optionalProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    apiKeyAuth: (_req: any, _res: any, next: any) => next(),
    requireCollectionAuth: (_req: any, _res: any, next: any) => next(),
    requireCollectionOrProjectAccess: (_req: any, _res: any, next: any) => next()
}));

const app = express();
app.use(express.json());
app.use('/projects', projectsRouter);

describe('projects/index route wiring', () => {
    it('should register core routes like /projects and /projects/:projectId', async () => {
        // All of these are smoke-tested: expect either 200, 400 or 404 (but not 500)
        const endpoints = [
            { method: 'get', path: '/projects' },
            { method: 'get', path: '/projects/foo' },
            { method: 'post', path: '/projects' },
            { method: 'patch', path: '/projects/foo' },
            { method: 'delete', path: '/projects/foo' }
        ];

        for (const { method, path } of endpoints) {
            const res = await request(app)[method](path).send({});
            expect([200, 204, 400, 404]).toContain(res.status);
        }
    });
});

describe('projectsSpecs export', () => {
    it('should include all expected OpenAPI paths and schemas', () => {
        expect(projectsSpecs.paths).toHaveProperty('/projects');
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}');
        expect(projectsSpecs.schemas).toHaveProperty('NewProjectInput');
    });

    it('should include activity log, comments, reviews, and notifications in OpenAPI paths', () => {
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}/activity');
        expect(projectsSpecs.paths).toHaveProperty(
            '/projects/{projectId}/activity/{resourceType}/{resourceId}'
        );
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}/comments');
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}/comments/{id}');
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}/comments/{id}/resolve');
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}/reviews');
        expect(projectsSpecs.paths).toHaveProperty('/projects/{projectId}/notifications');
    });

    it('should include Activity and Comment schemas for docs', () => {
        expect(projectsSpecs.schemas).toHaveProperty('ActivityEvent');
        expect(projectsSpecs.schemas).toHaveProperty('Comment');
    });
});

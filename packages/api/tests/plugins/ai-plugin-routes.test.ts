/**
 * Unit tests: AI routes from @moteurio/ai (createAiRouter, getAiOpenApiPaths).
 * AI is a core feature mounted by the API at /ai, not an optional plugin.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAiRouter, getAiOpenApiPaths, setAdapter, MockAdapter } from '@moteurio/ai';

const noop = (_req: any, _res: any, next: () => void) => next();

describe('AI plugin getRoutes', () => {
    it('@moteurio/ai exports createAiRouter and getAiOpenApiPaths', () => {
        expect(typeof createAiRouter).toBe('function');
        expect(typeof getAiOpenApiPaths).toBe('function');
        const paths = getAiOpenApiPaths();
        expect(paths).toHaveProperty('/ai/status');
        expect(paths).toHaveProperty('/ai/settings/{projectId}');
        expect((paths['/ai/status'] as any).get?.summary).toBe('Check if AI is enabled');
        expect((paths['/ai/settings/{projectId}'] as any).get?.summary).toContain('AI overview');
    });

    it('createAiRouter returns router with /ai/status', () => {
        const routeContext = {
            requireAuth: noop,
            requireProjectAccess: noop,
            requireOperator: noop
        };
        const router = createAiRouter(routeContext);
        expect(typeof router.use).toBe('function');
        const paths = getAiOpenApiPaths();
        expect(Object.keys(paths)).toEqual(expect.arrayContaining(['/ai/status']));
    });

    it('GET /ai/status returns 200 with enabled: true when adapter is set', async () => {
        setAdapter(new MockAdapter());
        try {
            const routeContext = {
                requireAuth: (req: any, _res: any, next: () => void) => {
                    req.user = { id: 'u1' };
                    next();
                },
                requireProjectAccess: noop,
                requireOperator: noop
            };
            const app = express();
            app.use(express.json());
            app.use('/ai', createAiRouter(routeContext));

            const res = await request(app).get('/ai/status');
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                enabled: true,
                creditsGloballyDisabled: expect.any(Boolean)
            });
            expect(res.body).toHaveProperty('textProvider');
        } finally {
            setAdapter(null);
        }
    });

    it('GET /ai/settings/:projectId returns textAi and credits', async () => {
        setAdapter(new MockAdapter());
        try {
            const routeContext = {
                requireAuth: (req: any, _res: any, next: () => void) => {
                    req.user = { id: 'u1' };
                    next();
                },
                requireProjectAccess: (_req: any, _res: any, next: () => void) => next(),
                requireOperator: noop
            };
            const app = express();
            app.use(express.json());
            app.use('/ai', createAiRouter(routeContext));

            const res = await request(app).get('/ai/settings/demo-project');
            expect(res.status).toBe(200);
            expect(res.body.textAi).toMatchObject({ enabled: true });
            expect(res.body.textAi.provider).toBeNull();
            expect(res.body.credits).toMatchObject({
                remaining: expect.any(Number),
                unlimited: expect.any(Boolean)
            });
        } finally {
            setAdapter(null);
        }
    });

    it('GET /ai/status returns enabled false when no provider is configured', async () => {
        setAdapter(null);
        const routeContext = {
            requireAuth: (req: any, _res: any, next: () => void) => {
                req.user = { id: 'u1' };
                next();
            },
            requireProjectAccess: noop,
            requireOperator: noop
        };
        const app = express();
        app.use(express.json());
        app.use('/ai', createAiRouter(routeContext));

        const res = await request(app).get('/ai/status');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            enabled: false,
            textProvider: null,
            creditsGloballyDisabled: expect.any(Boolean)
        });
    });

    it('GET /ai/status returns 401 when requireAuth rejects', async () => {
        const routeContext = {
            requireAuth: (_req: any, res: any) => res.status(401).json({ error: 'Unauthorized' }),
            requireProjectAccess: noop,
            requireOperator: noop
        };
        const app = express();
        app.use(express.json());
        app.use('/ai', createAiRouter(routeContext));

        const res = await request(app).get('/ai/status');
        expect(res.status).toBe(401);
    });
});

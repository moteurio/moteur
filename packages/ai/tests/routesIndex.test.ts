import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createAiRouter, getAiOpenApiPaths } from '../src/routes/index.js';
import { setAdapter } from '../src/adapter.js';
import { MockAdapter } from '../src/providers/MockAdapter.js';
import { setCredits } from '../src/credits.js';

const auth = (req: any, _res: any, next: () => void) => {
    req.user = { id: 'u1' };
    next();
};
const pass = (_req: any, _res: any, next: () => void) => next();

describe('routes index', () => {
    const previousProvider = process.env.MOTEUR_AI_PROVIDER;

    afterEach(() => {
        setAdapter(null);
        process.env.MOTEUR_AI_PROVIDER = previousProvider;
    });

    it('prefixes OpenAPI paths with /ai', () => {
        const paths = getAiOpenApiPaths();
        expect(paths).toHaveProperty('/ai/status');
        expect(paths).toHaveProperty('/ai/settings/{projectId}');
        expect(paths).toHaveProperty('/ai/generate-image');
    });

    it('mounts subrouters and serves status + settings', async () => {
        process.env.MOTEUR_AI_PROVIDER = 'mock-provider';
        setAdapter(new MockAdapter());
        setCredits('proj-a', 77);

        const app = express();
        app.use(express.json());
        app.use(
            '/ai',
            createAiRouter({
                requireAuth: auth,
                requireProjectAccess: pass,
                requireOperator: pass
            } as any)
        );

        const [statusRes, settingsRes] = await Promise.all([
            request(app).get('/ai/status'),
            request(app).get('/ai/settings/proj-a')
        ]);

        expect(statusRes.status).toBe(200);
        expect(statusRes.body.enabled).toBe(true);
        expect(settingsRes.status).toBe(200);
        expect(settingsRes.body.credits.remaining).toBe(77);
    });
});

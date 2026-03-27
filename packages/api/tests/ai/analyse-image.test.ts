import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

/**
 * Plugin AI route: /ai/analyse/image. Currently stubbed (501) in plugin; full logic lives in imageAnalysis.test.ts.
 */
import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createAiRouter } from '@moteurio/ai';

const noop = (_req: any, _res: any, next: () => void) => next();

function createAiRouterApp() {
    const routeContext = {
        requireAuth: (req: any, _res: any, next: () => void) => {
            req.user = { id: 'user1', roles: [OPERATOR_ROLE_SLUG] };
            next();
        },
        requireProjectAccess: noop,
        requireOperator: noop
    };
    const app = express();
    app.use(express.json());
    app.use('/ai', createAiRouter(routeContext));
    return app;
}

describe('POST /ai/analyse/image (plugin stub)', () => {
    let app: express.Express;

    beforeEach(() => {
        app = createAiRouterApp();
    });

    it('returns 501 (not yet implemented in plugin)', async () => {
        const res = await request(app).post('/ai/analyse/image').send({
            assetUrl: 'https://example.com/img.png',
            locale: 'en',
            projectId: 'p1'
        });
        expect(res.status).toBe(501);
        expect(res.body.error).toMatch(/implement in plugin/i);
    });
});

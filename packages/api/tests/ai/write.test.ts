import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

/**
 * Plugin AI route: /ai/write/*. Currently stubbed (501) in plugin; writing logic tested in writing.test.ts.
 */
import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createAiRouter } from '@moteurio/ai';

const noop = (_req: any, _res: any, next: () => void) => next();

function createAiRouterApp() {
    const routeContext = {
        requireAuth: noop,
        requireProjectAccess: (req: any, _res: any, next: () => void) => {
            req.user = { id: 'user1', roles: [OPERATOR_ROLE_SLUG] };
            next();
        },
        requireOperator: noop
    };
    const app = express();
    app.use(express.json());
    app.use('/ai', createAiRouter(routeContext));
    return app;
}

describe('POST /ai/write/draft (plugin stub)', () => {
    let app: express.Express;

    beforeEach(() => {
        app = createAiRouterApp();
    });

    it('returns 501 (not yet implemented in plugin)', async () => {
        const res = await request(app).post('/ai/write/draft').send({
            projectId: 'p1',
            modelId: 'article',
            entryId: 'e1',
            fieldPath: 'title',
            locale: 'en'
        });
        expect(res.status).toBe(501);
        expect(res.body.error).toMatch(/implement in plugin/i);
    });
});

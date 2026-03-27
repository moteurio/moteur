import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { requireOperator } from '../middlewares/auth.js';
import { getUsageCounts } from '../usage/usageStore.js';

const router: Router = Router();

router.get('/', requireOperator, (_req, res) => {
    const counts = getUsageCounts();
    res.json(counts);
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/studio/usage': {
        get: {
            summary: 'Get API request counts (studio and public)',
            tags: ['Usage'],
            responses: {
                '200': {
                    description:
                        'studio: { total, windowStart }, public: { byProject: { [projectId]: { total, windowStart } } }',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/UsageCounts' }
                        }
                    }
                }
            }
        }
    }
};

export default router;

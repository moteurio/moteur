import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireOperator } from '../middlewares/auth.js';
import { runSeed } from '@moteurio/core/seed.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

router.post('/', requireOperator, (req: Request, res: Response) => {
    try {
        const force = req.body?.force === true;
        const result = runSeed({ force });
        return void res.json(result);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/studio/seed': {
        post: {
            summary: 'Run seed (copy blueprint seeds to blueprints dir)',
            description:
                'Operator only. Copies from data/seeds/blueprints/ to data/blueprints/. Use force: true to overwrite.',
            tags: ['Seed'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { force: { type: 'boolean', default: false } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Result with copied and skipped lists',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    copied: { type: 'array', items: { type: 'string' } },
                                    skipped: { type: 'array', items: { type: 'string' } }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;

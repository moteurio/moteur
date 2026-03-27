import type { Request, Response } from 'express';
/**
 * Global (non-project-scoped) block registry routes.
 * Canonical: `{API_BASE_PATH}/moteur/blocks`. When `API_BASE_PATH` is empty, `/api/moteur/blocks` is also mounted for compatibility. GET: JWT. POST: operator.
 *
 * NOTE: The "public/" folder name is a legacy artifact — these routes are NOT
 * publicly accessible. They live here because they are global (not under
 * /projects/:projectId).
 */
import express, { Router } from 'express';
import { createBlock, listBlocks } from '@moteurio/core/blocks.js';
import { stripVariantHintsFromBlockSchema } from '../utils/stripBlockSchema.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireAuth, requireOperator } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = express.Router();

router.get('/', requireAuth, (_req, res) => {
    const all = listBlocks();
    const stripped = Object.fromEntries(
        Object.entries(all).map(([k, v]) => [
            k,
            stripVariantHintsFromBlockSchema(v as unknown as Record<string, unknown>)
        ])
    );
    res.json(stripped);
});

router.post('/', requireOperator, (req: Request, res: Response) => {
    try {
        const schema = req.body;
        if (!schema || typeof schema !== 'object') {
            return void res
                .status(400)
                .json({ error: 'Request body must be a block schema object' });
        }
        const created = createBlock(schema);
        return void res.status(201).json(created);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const blocksSecurity: OpenAPIV3.SecurityRequirementObject[] = [{ bearerAuth: [] }];

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/moteur/blocks': {
        get: {
            summary: 'List block types',
            description:
                'Returns all registered block schemas with variant hints stripped. Requires JWT.',
            tags: ['Blocks'],
            security: blocksSecurity,
            responses: {
                '200': {
                    description: 'Map of block id to block schema',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/BlockDefinitionsMap' }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Register global (core) block type',
            description:
                'Creates data/core/blocks/<slug>.json. Operator role required. For tenant-specific blocks use POST /projects/{projectId}/blocks.',
            tags: ['Blocks'],
            security: [{ bearerAuth: [] }],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Block created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Request body must be a block schema object',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    }
};

export default router;

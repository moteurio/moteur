import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import fieldRegistry from '@moteurio/core/registry/FieldRegistry.js';
import { requireAuth } from '../middlewares/auth.js';

const router: Router = Router();

/**
 * Every field type the engine knows (core and plugins), with the options each one takes, so the
 * Studio can offer them when someone adds or edits a field. Validators and other code stay here.
 */
router.get('/', requireAuth, (_req, res) => {
    const types = Object.values(fieldRegistry.all()).map(t => ({
        type: t.type,
        label: t.label,
        ...(t.description ? { description: t.description } : {}),
        ...(t.optionsSchema ? { options: t.optionsSchema } : {})
    }));
    res.json({ types });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/studio/field-types': {
        get: {
            summary: 'List field types and the options each one takes',
            tags: ['Studio'],
            responses: {
                '200': {
                    description: '{ types: [{ type, label, description?, options? }] }',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { types: { type: 'array', items: { type: 'object' } } }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;

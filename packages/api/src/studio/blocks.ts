import type { Request, Response } from 'express';
import express, { Router } from 'express';
import type { BlockSchema } from '@moteurio/types/Block.js';
import {
    listBlocks,
    getBlock,
    createProjectBlock,
    updateProjectBlock,
    deleteProjectBlock
} from '@moteurio/core/blocks.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../middlewares/auth.js';
import { stripVariantHintsFromBlockSchema } from '../utils/stripBlockSchema.js';
import { getMessage } from '../utils/apiError.js';

const router: Router = express.Router({ mergeParams: true });

router.get('/', requireProjectAccess, (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const blocks = listBlocks(projectId);
    const stripped = Object.fromEntries(
        Object.entries(blocks).map(([k, v]) => [
            k,
            stripVariantHintsFromBlockSchema(v as unknown as Record<string, unknown>)
        ])
    );
    res.json(stripped);
});

function resolveBlockTypeKey(projectId: string, slugParam: string): string | undefined {
    const param = decodeURIComponent(slugParam).trim();
    if (!param) return undefined;
    const all = listBlocks(projectId);
    if (param.includes('/')) {
        return all[param] ? param : undefined;
    }
    const projectKey = `${projectId}/${param}`;
    if (all[projectKey]) return projectKey;
    const coreKey = `core/${param}`;
    if (all[coreKey]) return coreKey;
    return Object.keys(all).find(k => k.endsWith(`/${param}`));
}

router.get('/:slug', requireProjectAccess, (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const slug = req.params.slug as string;
    const key = resolveBlockTypeKey(projectId, slug);
    if (!key) {
        return void res.status(404).json({ error: 'Block type not found' });
    }
    try {
        const schema = getBlock(key, projectId);
        res.json(stripVariantHintsFromBlockSchema(schema as unknown as Record<string, unknown>));
    } catch (err: unknown) {
        const msg = err instanceof Error ? getMessage(err) : 'Unknown error';
        return void res.status(404).json({ error: msg });
    }
});

router.post('/', requireProjectAccess, (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    try {
        const body = req.body as BlockSchema;
        if (!body || typeof body !== 'object') {
            return void res
                .status(400)
                .json({ error: 'Request body must be a block schema object' });
        }
        const created = createProjectBlock(projectId, body);
        return void res.status(201).json(created);
    } catch (err: unknown) {
        const msg = err instanceof Error ? getMessage(err) : 'Failed to create block';
        return void res.status(400).json({ error: msg });
    }
});

router.put('/:slug', requireProjectAccess, (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const slug = req.params.slug as string;
    try {
        const body = req.body as Partial<BlockSchema>;
        if (!body || typeof body !== 'object') {
            return void res
                .status(400)
                .json({ error: 'Request body must be a block schema object' });
        }
        const updated = updateProjectBlock(projectId, slug, body, 'replace');
        return void res.json(updated);
    } catch (err: unknown) {
        const msg = err instanceof Error ? getMessage(err) : 'Failed to update block';
        const status = msg.includes('not found') ? 404 : 400;
        return void res.status(status).json({ error: msg });
    }
});

router.patch('/:slug', requireProjectAccess, (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const slug = req.params.slug as string;
    try {
        const body = req.body as Partial<BlockSchema>;
        if (!body || typeof body !== 'object') {
            return void res.status(400).json({ error: 'Request body must be a JSON object' });
        }
        const updated = updateProjectBlock(projectId, slug, body, 'merge');
        return void res.json(updated);
    } catch (err: unknown) {
        const msg = err instanceof Error ? getMessage(err) : 'Failed to update block';
        const status = msg.includes('not found') ? 404 : 400;
        return void res.status(status).json({ error: msg });
    }
});

router.delete('/:slug', requireProjectAccess, (req: Request, res: Response) => {
    const projectId = req.params.projectId as string;
    const slug = req.params.slug as string;
    try {
        deleteProjectBlock(projectId, slug);
        return void res.status(204).send();
    } catch (err: unknown) {
        const msg = err instanceof Error ? getMessage(err) : 'Failed to delete block';
        const status = msg.includes('not found') ? 404 : 400;
        return void res.status(status).json({ error: msg });
    }
});

const blocksSecurity: OpenAPIV3.SecurityRequirementObject[] = [{ bearerAuth: [] }];

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/blocks': {
        get: {
            summary: 'List block types (core + project overrides)',
            description:
                'Merges built-in core/* blocks, plugin blocks, and JSON under data/projects/{projectId}/blocks.',
            tags: ['Blocks'],
            security: blocksSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Map of block type id to block schema',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/BlockDefinitionsMap' }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a project-scoped block type',
            description:
                'Writes data/projects/{projectId}/blocks/<slug>.json. Type becomes {projectId}/<slug>. Does not modify core/*.',
            tags: ['Blocks'],
            security: blocksSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
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
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/blocks/{slug}': {
        get: {
            summary: 'Get one block type by slug',
            description:
                'Slug is the segment after the project namespace (e.g. hero for mysite/hero). You may also pass mysite/hero URL-encoded as one path segment.',
            tags: ['Blocks'],
            security: blocksSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Block schema',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        },
        put: {
            summary: 'Replace a project block type',
            description:
                'Only blocks defined in the project blocks directory; core/* are read-only here.',
            tags: ['Blocks'],
            security: blocksSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Block updated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Bad request',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '404': {
                    description: 'No project block file',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        },
        patch: {
            summary: 'Patch a project block type',
            tags: ['Blocks'],
            security: blocksSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Block updated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '400': {
                    description: 'Bad request',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '404': {
                    description: 'No project block file',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        },
        delete: {
            summary: 'Delete a project block type file',
            tags: ['Blocks'],
            security: blocksSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
                '400': {
                    description: 'Bad request',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '404': {
                    description: 'No project block file',
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

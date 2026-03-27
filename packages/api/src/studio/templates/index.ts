import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    listTemplates,
    getTemplate as getTemplatePublic,
    getTemplateWithAuth,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    validateTemplateById
} from '@moteurio/core/templates.js';
import { getBlueprint } from '@moteurio/core/blueprints.js';
import { optionalProjectAccess, requireProjectAccess } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', optionalProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const templates = await listTemplates(projectId);
        return void res.json(templates);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:id', optionalProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const template = req.user
            ? await getTemplateWithAuth(req.user, projectId, id)
            : await getTemplatePublic(projectId, id);
        return void res.json(template);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body as Record<string, unknown>;
        let data: Parameters<typeof createTemplate>[2];

        if (body.blueprintId) {
            const blueprint = getBlueprint('template', body.blueprintId as string);
            if ((blueprint.kind ?? 'project') !== 'template') {
                return void res
                    .status(400)
                    .json({ error: 'Blueprint is not a template blueprint' });
            }
            const t = blueprint.template as
                | {
                      template?: {
                          id?: string;
                          label: string;
                          description?: string;
                          fields?: Record<string, unknown>;
                      };
                  }
                | undefined;
            if (!t?.template) {
                return void res.status(400).json({ error: 'Blueprint has no template.template' });
            }
            const { blueprintId: _b, ...overrides } = body;
            const merged = { ...t.template, ...overrides };
            const id =
                (merged.id as string) ??
                ((merged.label as string)?.replace(/[^a-z0-9-_]/gi, '-').toLowerCase() ||
                    'template');
            data = { ...merged, id, projectId } as Parameters<typeof createTemplate>[2];
        } else {
            data = { ...body, projectId } as Parameters<typeof createTemplate>[2];
        }

        const template = await createTemplate(projectId, req.user!, data);
        return void res.status(201).json(template);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.put('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const template = await updateTemplate(projectId, req.user!, id, req.body);
        return void res.json(template);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const template = await updateTemplate(projectId, req.user!, id, req.body);
        return void res.json(template);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteTemplate(projectId, req.user!, id);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/:id/validate', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const result = await validateTemplateById(projectId, id);
        return void res.json(result);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const templateJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/templates': {
        get: {
            summary: 'List templates',
            tags: ['Templates'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of templates',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/JsonRecord' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create template',
            tags: ['Templates'],
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
                    description: 'Template created',
                    ...templateJson
                }
            }
        }
    },
    '/projects/{projectId}/templates/{id}': {
        get: {
            summary: 'Get template',
            tags: ['Templates'],
            responses: {
                '200': {
                    description: 'Template',
                    ...templateJson
                }
            }
        },
        put: {
            summary: 'Replace template',
            tags: ['Templates'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Template updated',
                    ...templateJson
                }
            }
        },
        patch: {
            summary: 'Patch template',
            tags: ['Templates'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Template updated',
                    ...templateJson
                }
            }
        },
        delete: {
            summary: 'Delete template',
            tags: ['Templates'],
            responses: { '204': { description: 'Deleted' } }
        }
    },
    '/projects/{projectId}/templates/{id}/validate': {
        post: {
            summary: 'Validate template',
            tags: ['Templates'],
            responses: {
                '200': {
                    description: 'Validation result',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/PageValidationResult' }
                        }
                    }
                }
            }
        }
    }
};

export default router;

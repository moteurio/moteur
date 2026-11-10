import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listProjects } from '@moteurio/core/projects.js';
import { redactProjectSecrets } from '@moteurio/core/assets/mediaSettings.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = Router();

router.get('/', requireAuth, (req: Request, res: Response) => {
    // `?workspace=ws_…` limits the list to that workspace's projects, and only those the caller belongs to.
    const workspace = typeof req.query.workspace === 'string' ? req.query.workspace : undefined;
    const projects = listProjects(req.user!).filter(p => !workspace || p.workspaceId === workspace);
    res.json({ projects: projects.map(p => redactProjectSecrets(p)) });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects': {
        get: {
            summary: 'List the projects the signed-in user belongs to',
            description:
                'Every project you are in: those you were added to, and those your workspaces give you. `workspace` narrows it to one workspace.',
            tags: ['Projects'],
            parameters: [
                {
                    name: 'workspace',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'A workspace id (`ws_…`): only its projects.'
                }
            ],
            responses: {
                '200': {
                    description: 'List of projects',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    projects: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Project' }
                                    }
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

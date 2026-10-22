import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { listProjects } from '@moteurio/core/projects.js';
import { redactProjectSecrets } from '@moteurio/core/assets/mediaSettings.js';
import type { OpenAPIV3 } from 'openapi-types';

const router: Router = Router();

router.get('/', requireAuth, (req: Request, res: Response) => {
    const projects = listProjects(req.user!);
    res.json({ projects: projects.map(p => redactProjectSecrets(p)) });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects': {
        get: {
            summary: 'List the projects the signed-in user belongs to',
            tags: ['Projects'],
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

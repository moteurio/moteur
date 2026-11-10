import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { moveProject } from '@moteurio/core/projects.js';
import { redactProjectSecrets } from '@moteurio/core/assets/mediaSettings.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

/** Moves the project to another workspace, handing it over. Body: `{ workspaceId }`. */
router.post('/:projectId/move', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const workspaceId = (req.body ?? {}).workspaceId;
    if (typeof workspaceId !== 'string' || !workspaceId)
        return void res.status(400).json({ error: 'workspaceId is required' });
    try {
        const project = await moveProject(req.account!, projectId!, workspaceId);
        res.json({ project: redactProjectSecrets(project) });
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/move': {
        post: {
            summary: 'Move a project to another workspace',
            description:
                'A handover: to a client’s own workspace, say. The owners and admins of its workspace move it, to a workspace where they may start projects (owner, admin or member there). People added to the project one by one stay in it; the old workspace’s team no longer is, the new one’s now is. Its content, history, keys and channels are unchanged.',
            tags: ['Projects'],
            security: [{ bearerAuth: [] }],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['workspaceId'],
                            properties: { workspaceId: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: '`{ project }`, in its new workspace',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { project: { $ref: '#/components/schemas/Project' } }
                            }
                        }
                    }
                },
                '400': { description: 'No workspaceId' },
                '403': {
                    description:
                        'Not an owner or admin of its workspace, or may not start projects in the other'
                },
                '404': { description: 'Not a workspace you are in (`WORKSPACE_NOT_FOUND`)' }
            }
        }
    }
};

export default router;

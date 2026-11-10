import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { keepDemoCopy } from '@moteurio/core/demoCopies.js';
import { requireProjectAdmin } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router();

/** Converts a demo copy into the user's own project, which then counts against their plan. */
router.post('/:projectId/keep', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        res.json({ project: await keepDemoCopy(req.user!, projectId) });
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/keep': {
        post: {
            summary: 'Keep a demo copy as your own project',
            description:
                'A demo copy (`demo` on the project) serves no site, is never its person’s free project and goes to the trash after 30 days without a change. Kept, it loses `demo` and counts as a project its Admin made: their free project, or one that needs a plan. Refused with `plan_limit` (402) like a new project when they may start no more.',
            tags: ['Projects'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: '`{ project }`: the project, now theirs, without `demo`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    project: { type: 'object', additionalProperties: true }
                                }
                            }
                        }
                    }
                },
                '403': { description: 'Only the copy’s Admin can keep it' },
                '409': { description: 'Not a demo copy (`NOT_DEMO_COPY`)' }
            }
        }
    }
};

export default router;

import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    listSubmissions,
    getSubmission,
    deleteSubmission
} from '@moteurio/core/formSubmissions.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { FormSubmissionStatus } from '@moteurio/types/Form.js';
import { getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

type FormSubmissionsParams = { projectId: string; formId: string };
type SubmissionParams = { projectId: string; formId: string; submissionId: string };
type SubmissionsListQuery = { status?: string; limit?: string };

const SUBMISSION_STATUSES: FormSubmissionStatus[] = ['received', 'processed', 'spam'];

function isFormSubmissionStatus(s: string): s is FormSubmissionStatus {
    return (SUBMISSION_STATUSES as readonly string[]).includes(s);
}

function parseSubmissionStatus(raw: string | undefined): FormSubmissionStatus | undefined {
    if (raw === undefined || raw === '') return undefined;
    return isFormSubmissionStatus(raw) ? raw : undefined;
}

function parseSubmissionLimit(raw: string | undefined, fallback: number): number {
    if (raw === undefined || raw === '') return fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(0, n), 500);
}

router.get(
    '/',
    requireProjectAccess,
    async (
        req: Request<FormSubmissionsParams, unknown, unknown, SubmissionsListQuery>,
        res: Response
    ) => {
        const { projectId, formId } = req.params;
        if (!projectId || !formId) {
            return void res.status(400).json({ error: 'Missing projectId or formId' });
        }
        try {
            const statusRaw = req.query.status;
            if (
                statusRaw !== undefined &&
                statusRaw !== '' &&
                parseSubmissionStatus(statusRaw) === undefined
            ) {
                return void res.status(400).json({ error: 'Invalid status filter' });
            }
            const status = parseSubmissionStatus(statusRaw);
            const limit = parseSubmissionLimit(req.query.limit, 50);
            const submissions = await listSubmissions(req.user!, projectId, formId, {
                ...(status !== undefined && { status }),
                limit
            });
            return void res.json({ submissions });
        } catch (err: unknown) {
            const code = getMessage(err)?.includes('not found') ? 404 : 500;
            return void res
                .status(code)
                .json({ error: getMessage(err) ?? 'Failed to list submissions' });
        }
    }
);

router.get(
    '/:submissionId',
    requireProjectAccess,
    async (req: Request<SubmissionParams>, res: Response) => {
        const { projectId, formId, submissionId } = req.params;
        if (!projectId || !formId || !submissionId) {
            return void res
                .status(400)
                .json({ error: 'Missing projectId, formId or submissionId' });
        }
        try {
            const submission = await getSubmission(req.user!, projectId, formId, submissionId);
            return void res.json({ submission });
        } catch (err: unknown) {
            const code = getMessage(err)?.includes('not found') ? 404 : 500;
            return void res
                .status(code)
                .json({ error: getMessage(err) ?? 'Failed to get submission' });
        }
    }
);

router.delete(
    '/:submissionId',
    requireProjectAccess,
    async (req: Request<SubmissionParams>, res: Response) => {
        const { projectId, formId, submissionId } = req.params;
        if (!projectId || !formId || !submissionId) {
            return void res
                .status(400)
                .json({ error: 'Missing projectId, formId or submissionId' });
        }
        try {
            await deleteSubmission(req.user!, projectId, formId, submissionId);
            return void res.status(204).send();
        } catch (err: unknown) {
            const code = getMessage(err)?.includes('not found') ? 404 : 400;
            return void res
                .status(code)
                .json({ error: getMessage(err) ?? 'Failed to delete submission' });
        }
    }
);

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/forms/{formId}/submissions': {
        get: {
            summary: 'List form submissions',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'status', in: 'query', schema: { type: 'string' } },
                { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
            ],
            responses: {
                '200': {
                    description: 'Submissions',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/FormSubmissionsListResponse' }
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
        }
    },
    '/projects/{projectId}/forms/{formId}/submissions/{submissionId}': {
        get: {
            summary: 'Get one submission',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Submission',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/FormSubmissionOneResponse' }
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
        delete: {
            summary: 'Soft-delete submission',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
                '404': {
                    description: 'Not found',
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

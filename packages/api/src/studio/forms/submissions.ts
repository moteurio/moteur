import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    querySubmissions,
    getSubmission,
    deleteSubmission,
    updateSubmission
} from '@moteurio/core/formSubmissions.js';
import { UserDataStore } from '@moteurio/core/utils/userDataStore.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { FormSubmissionStatus } from '@moteurio/types/Form.js';
import { getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

type FormSubmissionsParams = { projectId: string; formId: string };
type SubmissionParams = { projectId: string; formId: string; submissionId: string };
type SubmissionsListQuery = { status?: string; limit?: string; offset?: string; unread?: string };

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
        const { projectId, formId } = req.params as Record<string, string>;
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
            const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
            const unread = req.query.unread === '1' || req.query.unread === 'true';
            const page = await querySubmissions(req.user!, projectId, formId, {
                ...(status !== undefined && { status }),
                ...(unread && { unread }),
                offset,
                limit
            });
            return void res.json(page);
        } catch (err: unknown) {
            const code = getMessage(err)?.includes('not found') ? 404 : 500;
            return void res
                .status(code)
                .json({ error: getMessage(err) ?? 'Failed to list submissions' });
        }
    }
);

// Every submission of the form as a file: CSV for spreadsheets, or JSON.
router.get('/export', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params as Record<string, string>;
    const format = req.query.format === 'json' ? 'json' : 'csv';
    try {
        // Checks the form exists and the person may see it.
        await querySubmissions(req.user!, projectId, formId, { limit: 1 });
        const out = await UserDataStore.exportCollection(projectId, formId, format);
        const name = `${formId}-submissions.${format}`;
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        if (out.format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            // A byte-order mark so spreadsheet apps read accents correctly.
            return void res.send(`\uFEFF${out.data}`);
        }
        return void res.json(out.data);
    } catch (err: unknown) {
        const code = getMessage(err)?.includes('not found') ? 404 : 500;
        return void res.status(code).json({ error: getMessage(err) ?? 'Export failed' });
    }
});

// Mark read or unread, spam or not spam.
router.patch(
    '/:submissionId',
    requireProjectAccess,
    async (req: Request<SubmissionParams>, res: Response) => {
        const { projectId, formId, submissionId } = req.params as Record<string, string>;
        const body = (req.body ?? {}) as { read?: unknown; spam?: unknown };
        const patch: { read?: boolean; spam?: boolean } = {};
        for (const key of ['read', 'spam'] as const) {
            if (body[key] === undefined) continue;
            if (typeof body[key] !== 'boolean')
                return void res.status(400).json({ error: `"${key}" must be true or false.` });
            patch[key] = body[key] as boolean;
        }
        try {
            const submission = await updateSubmission(
                req.user!,
                projectId,
                formId,
                submissionId,
                patch
            );
            return void res.json({ submission });
        } catch (err: unknown) {
            const code = getMessage(err)?.includes('not found') ? 404 : 400;
            return void res
                .status(code)
                .json({ error: getMessage(err) ?? 'Failed to update submission' });
        }
    }
);

router.get(
    '/:submissionId',
    requireProjectAccess,
    async (req: Request<SubmissionParams>, res: Response) => {
        const { projectId, formId, submissionId } = req.params as Record<string, string>;
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
        const { projectId, formId, submissionId } = req.params as Record<string, string>;
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
                {
                    name: 'status',
                    in: 'query',
                    schema: { type: 'string', enum: ['received', 'processed', 'spam'] }
                },
                {
                    name: 'unread',
                    in: 'query',
                    description: 'Only submissions nobody has opened (spam left out)',
                    schema: { type: 'boolean' }
                },
                { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                {
                    name: 'limit',
                    in: 'query',
                    schema: { type: 'integer', default: 50, maximum: 500 }
                }
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
    '/projects/{projectId}/forms/{formId}/submissions/export': {
        get: {
            summary: 'Download every submission of a form',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'format',
                    in: 'query',
                    schema: { type: 'string', enum: ['csv', 'json'], default: 'csv' }
                }
            ],
            responses: {
                '200': {
                    description: 'A file: CSV (one column per field) or a JSON array',
                    content: {
                        'text/csv': { schema: { type: 'string' } },
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/JsonRecord' }
                            }
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
        patch: {
            summary: 'Mark a submission read or unread, spam or not spam',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { read: { type: 'boolean' }, spam: { type: 'boolean' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'The submission',
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

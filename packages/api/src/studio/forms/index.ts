import express, { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { FormSchema, MultilingualString } from '@moteurio/types/Form.js';
import {
    listForms,
    getForm,
    getFormForProject,
    createForm,
    updateForm,
    deleteForm
} from '@moteurio/core/forms.js';
import { createSubmission } from '@moteurio/core/formSubmissions.js';
import type { FormSubmissionMeta } from '@moteurio/types/Form.js';
import { optionalProjectAccess, requireProjectAccess } from '../../middlewares/auth.js';
import { formsSubmitRateLimiter } from '../../middlewares/rateLimit.js';
import { stripUiFromFieldOptions } from '../../utils/stripUiFromFields.js';
import submissionsRouter, { openapi as submissionsOpenapi } from './submissions.js';
import { mergePathSpecs } from '../../utils/mergePathSpecs.js';
import { sendApiError, getMessage as getErrorMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

function localizedSuccessMessage(msg: MultilingualString | undefined, locale?: string): string {
    if (!msg || typeof msg !== 'object') return 'Thank you for your submission.';
    if (locale && msg[locale]) return msg[locale];
    const first = Object.values(msg)[0];
    return typeof first === 'string' ? first : 'Thank you for your submission.';
}

function toPublicForm(form: FormSchema): Record<string, unknown> {
    const fields = form.fields
        ? Object.fromEntries(
              Object.entries(form.fields).map(([k, f]: [string, any]) => [
                  k,
                  {
                      ...f,
                      options: stripUiFromFieldOptions((f.options ?? {}) as Record<string, unknown>)
                  }
              ])
          )
        : form.fields;
    const out: Record<string, unknown> = {
        id: form.id,
        label: form.label,
        description: form.description,
        fields,
        submitLabel: form.submitLabel,
        successMessage: form.successMessage,
        honeypot: form.honeypot ?? true
    };
    if (form.redirectUrl != null && form.redirectUrl !== '') out.redirectUrl = form.redirectUrl;
    return out;
}

router.use('/:formId/submissions', submissionsRouter);

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const forms = await listForms(req.user!, projectId);
        return void res.json({ forms });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/:formId', optionalProjectAccess, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params;
    if (!projectId || !formId)
        return void res.status(400).json({ error: 'Missing projectId or formId' });
    try {
        if (req.user) {
            const form = await getForm(req.user, projectId, formId);
            return void res.json({ form });
        }
        const form = await getFormForProject(projectId, formId);
        if (!form) return void res.status(404).json({ error: 'Form not found' });
        if (form.status !== 'active')
            return void res.status(403).json({ error: 'Form is not active' });
        return void res.json({ form: toPublicForm(form) });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Public form submit (no auth)
router.post(
    '/:formId/submit',
    express.urlencoded({ extended: false }),
    formsSubmitRateLimiter,
    async (req: Request, res: Response): Promise<void> => {
        const { projectId, formId } = req.params;
        if (!projectId || !formId) {
            res.status(400).json({ error: 'Missing projectId or formId' });
            return;
        }
        try {
            const form = await getFormForProject(projectId, formId);
            if (!form) {
                res.status(404).json({ error: 'Form not found' });
                return;
            }
            if (form.status !== 'active') {
                res.status(403).json({ error: 'Form is not active' });
                return;
            }
            const body = req.body ?? {};
            const honeypotValue = body._honeypot;
            const honeypotTriggered =
                form.honeypot !== false &&
                honeypotValue !== undefined &&
                honeypotValue !== null &&
                String(honeypotValue).trim() !== '';
            const locale = (req.query.locale as string) || body._locale || undefined;
            const meta: FormSubmissionMeta = {
                submittedAt: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                locale: locale || undefined,
                honeypotTriggered
            };
            const cleanData: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(body)) {
                if (key.startsWith('_')) continue;
                cleanData[key] = value;
            }
            const submission = await createSubmission(projectId, formId, cleanData, meta);
            const message = localizedSuccessMessage(form.successMessage, locale);
            res.status(200).json({
                success: true,
                submissionId: submission.id,
                message,
                ...(form.redirectUrl ? { redirectUrl: form.redirectUrl } : {})
            });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body ?? {};
        const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = body;
        const form = await createForm(req.user!, projectId, rest as any);
        return void res.status(201).json({ form });
    } catch (err: unknown) {
        const msg = getErrorMessage(err) || 'Failed to create form';
        const isValidation =
            msg.includes('Invalid') || msg.includes('already exists') || msg.includes('required');
        return void res
            .status(isValidation ? 422 : 400)
            .json({ error: msg, requestId: req.requestId });
    }
});

router.patch('/:formId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params;
    if (!projectId || !formId) {
        return void res.status(400).json({ error: 'Missing projectId or formId' });
    }
    try {
        const patch = req.body ?? {};
        const form = await updateForm(req.user!, projectId, formId, patch);
        return void res.json({ form });
    } catch (err: unknown) {
        const msg = getErrorMessage(err) || 'Failed to update form';
        const code = msg.includes('not found') ? 404 : 400;
        return void res.status(code).json({ error: msg, requestId: req.requestId });
    }
});

router.delete('/:formId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params;
    if (!projectId || !formId) {
        return void res.status(400).json({ error: 'Missing projectId or formId' });
    }
    try {
        await deleteForm(req.user!, projectId, formId);
        return void res.status(204).send();
    } catch (err: unknown) {
        const msg = getErrorMessage(err) || 'Failed to delete form';
        const code = msg.includes('not found') ? 404 : 400;
        return void res.status(code).json({ error: msg, requestId: req.requestId });
    }
});

const formOne = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/FormOneResponse' }
        }
    }
};

const formsOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/forms': {
        get: {
            summary: 'List forms',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Forms',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/FormsListResponse' }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create form',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string' },
                                description: { type: 'string' },
                                fields: { type: 'object' },
                                status: { type: 'string', enum: ['active', 'inactive', 'archived'] }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Form created',
                    ...formOne
                },
                '422': {
                    description: 'Validation failed',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/forms/{formId}': {
        get: {
            summary: 'Get one form (full schema when authenticated, public when not)',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Form',
                    ...formOne
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
        patch: {
            summary: 'Update form',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Form updated',
                    ...formOne
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
            summary: 'Soft-delete form',
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } }
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

export const openapi = mergePathSpecs(formsOpenapi, submissionsOpenapi);

export default router;

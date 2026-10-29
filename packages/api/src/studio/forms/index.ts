import express, { Router, type Request, type Response } from 'express';
import cors from 'cors';
import type { OpenAPIV3 } from 'openapi-types';
import type { MultilingualString } from '@moteurio/types/Form.js';
import {
    listForms,
    getForm,
    getFormForProject,
    createForm,
    updateForm,
    deleteForm
} from '@moteurio/core/forms.js';
import { createSubmission } from '@moteurio/core/formSubmissions.js';
import { listFormActions } from '@moteurio/core/plugins/formExtensions.js';
import { CAPTCHA_FIELDS, issueFormToken, sentCaptcha } from '@moteurio/core/formGuard.js';
import { submissionSource } from '@moteurio/core/submissionSource.js';
import type { FormSubmissionMeta } from '@moteurio/types/Form.js';
import { requireProjectAccess, requireBuilder } from '../../middlewares/auth.js';
import { formsSubmitRateLimiter, formsTokenRateLimiter } from '../../middlewares/rateLimit.js';
import submissionsRouter, { openapi as submissionsOpenapi } from './submissions.js';
import { mergePathSpecs } from '../../utils/mergePathSpecs.js';
import { sendApiError, getMessage as getErrorMessage } from '../../utils/apiError.js';
import { PlanLimitError } from '@moteurio/core/planLimits.js';
import { revisionsRouter, revisionsOpenapi } from './revisions.js';

const router: Router = Router({ mergeParams: true });

router.use(revisionsRouter);

function localizedSuccessMessage(msg: MultilingualString | undefined, locale?: string): string {
    if (!msg || typeof msg !== 'object') return 'Thank you for your submission.';
    if (locale && msg[locale]) return msg[locale];
    const first = Object.values(msg)[0];
    return typeof first === 'string' ? first : 'Thank you for your submission.';
}

router.use('/:formId/submissions', submissionsRouter);

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const forms = await listForms(req.user!, projectId);
        return void res.json({ forms });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// The actions plugins add (a sheet, a CRM…), with the settings each asks of a form.
router.get('/actions', requireProjectAccess, (_req: Request, res: Response) => {
    res.json({ actions: listFormActions() });
});

router.get('/:formId', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params as Record<string, string>;
    if (!projectId || !formId)
        return void res.status(400).json({ error: 'Missing projectId or formId' });
    try {
        const form = await getForm(req.user!, projectId, formId);
        return void res.json({ form });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Sites on any domain send their forms here: no cookies or credentials, so any origin may.
const anySite = cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], credentials: false });
router.options('/:formId/submit', anySite);
router.options('/:formId/token', anySite);

// A site asks for a token when it shows the form, and sends it back as `_token`: an answer sent
// sooner than the form's minimum time after is kept as spam.
router.get(
    '/:formId/token',
    anySite,
    formsTokenRateLimiter,
    async (req: Request, res: Response): Promise<void> => {
        const { projectId, formId } = req.params as Record<string, string>;
        try {
            const form = await getFormForProject(projectId, formId);
            if (!form || form.status !== 'active') {
                res.status(404).json({ error: 'Form not found' });
                return;
            }
            res.set('Cache-Control', 'no-store');
            res.json({ token: issueFormToken(projectId, formId) });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

// Public form submit (no auth)
router.post(
    '/:formId/submit',
    anySite,
    express.urlencoded({ extended: false }),
    formsSubmitRateLimiter,
    async (req: Request, res: Response): Promise<void> => {
        const { projectId, formId } = req.params as Record<string, string>;
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
                ...submissionSource({
                    page: body._page,
                    referrer: body._referrer,
                    refererHeader: req.headers.referer
                }),
                honeypotTriggered
            };
            const cleanData: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(body)) {
                if (key.startsWith('_') || CAPTCHA_FIELDS.includes(key)) continue;
                cleanData[key] = value;
            }
            const submission = await createSubmission(projectId, formId, cleanData, meta, {
                honeypotTriggered,
                token: body._token,
                captcha: sentCaptcha(body),
                ip: req.ip
            });
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

router.post('/', requireBuilder, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const body = req.body ?? {};
        const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = body;
        const form = await createForm(req.user!, projectId, rest as any);
        return void res.status(201).json({ form });
    } catch (err: unknown) {
        if (err instanceof PlanLimitError) return void sendApiError(res, req, err);
        const msg = getErrorMessage(err) || 'Failed to create form';
        const isValidation =
            msg.includes('Invalid') || msg.includes('already exists') || msg.includes('required');
        return void res
            .status(isValidation ? 422 : 400)
            .json({ error: msg, requestId: req.requestId });
    }
});

router.patch('/:formId', requireBuilder, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params as Record<string, string>;
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

router.delete('/:formId', requireBuilder, async (req: Request, res: Response) => {
    const { projectId, formId } = req.params as Record<string, string>;
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
    '/projects/{projectId}/forms/{formId}/submit': {
        post: {
            summary: 'Send a form (what visitors do)',
            description:
                "No key or cookie, from any site, as a plain form post or JSON. Keys starting with `_` are not kept (`_honeypot`, `_locale`, `_token`, `_page`, `_referrer`), nor the captcha widgets' answers (`cf-turnstile-response`, `h-captcha-response`, `g-recaptcha-response`, or `_captcha`). The server checks every answer against the form: only its fields are kept, required ones must be there, emails, numbers (with min and max), dates, web addresses and choices must fit, and text has a length limit. Issues are worded in `locale`, or in the field's own `messages`. Then it tells people from bots: the honeypot, the time trap (`_token`, from GET …/token, sent sooner than the form's minimum is spam) and the form's captcha, checked with its provider. Spam gets the same thank-you, is kept 30 days, runs no actions and isn't counted against the plan.",
            tags: ['Forms'],
            security: [],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description: 'The language of the thank-you and of any error message.'
                }
            ],
            requestBody: {
                content: {
                    'application/x-www-form-urlencoded': {
                        schema: { type: 'object', additionalProperties: true }
                    },
                    'application/json': { schema: { type: 'object', additionalProperties: true } }
                }
            },
            responses: {
                '200': {
                    description: 'Received',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    success: { type: 'boolean' },
                                    submissionId: { type: 'string' },
                                    message: { type: 'string' },
                                    redirectUrl: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description:
                        'The form has a captcha and it wasn’t answered, or its provider refused the answer: `code` is `CAPTCHA_FAILED`, `error` asks the visitor to answer it and send again.'
                },
                '403': { description: 'The form is not active' },
                '404': { description: 'No such form' },
                '422': {
                    description:
                        'Some answers don’t fit the form: `error` names them for the visitor, `issues` lists `{ field, code, message }` (code: required, invalid, too_long, too_short, too_small, too_large, choice).',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' },
                                    code: { type: 'string', enum: ['ANSWERS_INVALID'] },
                                    issues: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                field: { type: 'string' },
                                                code: { type: 'string' },
                                                message: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                '429': { description: 'Too many sends from this address' }
            }
        }
    },
    '/projects/{projectId}/forms/{formId}/token': {
        get: {
            summary: 'Get a token when showing a form (time trap)',
            description:
                "No key or cookie, from any site. Ask for it when the visitor sees the form and send it back as `_token`: an answer sent sooner than the form's `timeTrap.minSeconds` (default 3) after is kept as spam. A token lasts 24 hours. With `timeTrap.required`, answers without one are spam too.",
            tags: ['Forms'],
            security: [],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'formId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'A token for this form, signed, saying when it was shown',
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { token: { type: 'string' } } }
                        }
                    }
                },
                '404': { description: 'No such form, or it is not active' },
                '429': { description: 'Too many requests for this form' }
            }
        }
    },
    '/projects/{projectId}/forms/actions': {
        get: {
            summary: 'The actions plugins add to forms',
            description:
                "Each with its `type` (put it in a form's `actions` with a `config`), a label, and the `settings` it asks for. Empty when no plugin adds any.",
            tags: ['Forms'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: '`{ actions }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    actions: { type: 'array', items: { type: 'object' } }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
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
            summary: 'Get one form, full schema (Studio). Sites read forms through a channel.',
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

export const openapi = mergePathSpecs(revisionsOpenapi, formsOpenapi, submissionsOpenapi);

export default router;

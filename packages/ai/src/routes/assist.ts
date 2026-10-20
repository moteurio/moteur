/**
 * The Studio's helpers: what a person may ask for in a project, and the requests themselves
 * (writing help, translating a field, describing a picture). Nothing here saves content: each
 * answer is a suggestion the Studio shows for a person to keep or discard.
 */
import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { AiHelper, ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from '@moteurio/core/projects.js';
import { getAsset } from '@moteurio/core/assets/assetService.js';
import { appendAiAuditEvent } from '@moteurio/core/aiAuditLogger.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';
import { getAdapter } from '../adapter.js';
import { getCredits, deductCredits, isAiCreditsDisabled } from '../credits.js';
import { DEFAULT_CREDIT_COSTS, getCreditCost } from '../creditCosts.js';
import { runWritingAction, type WritingAction } from '../writing.js';
import { translateField, type TranslatableFieldType } from '../translation.js';
import { analyseImage } from '../imageAnalysis.js';
import { assertHelper, helperStates, AiHelperError } from '../helpers.js';

const WRITING_ACTIONS: WritingAction[] = [
    'draft',
    'rewrite',
    'shorten',
    'expand',
    'tone:formal',
    'tone:conversational',
    'tone:editorial',
    'summarise-excerpt'
];
const TEXT_TYPES = ['core/text', 'core/textarea', 'core/rich-text'];

const provider = () => (process.env.MOTEUR_AI_PROVIDER ?? '').trim().toLowerCase() || 'unknown';

class Refused extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message);
    }
}

/** Project, person and helper checks shared by every request. */
async function prepare(req: Request, helper: AiHelper, cost: number) {
    const user = (req as Request & { user?: User }).user!;
    const projectId = String(req.body?.projectId ?? '');
    if (!projectId) throw new Refused(400, 'BAD_REQUEST', 'Missing projectId');
    const project = await getProject(user, projectId);
    assertHelper(project, user, helper);
    if (!(await getAdapter()))
        throw new Refused(503, 'AI_UNAVAILABLE', 'No AI provider is set up on this server.');
    if (getCredits(projectId) < cost)
        throw new Refused(402, 'INSUFFICIENT_CREDITS', 'Not enough AI credits left this month.');
    return { user, project, projectId };
}

/** Runs a request: credits are taken only when it succeeds, and every attempt is logged. */
async function run(
    req: Request,
    res: Response,
    helper: AiHelper,
    action: string,
    cost: number,
    work: (ctx: {
        user: User;
        project: ProjectSchema;
        projectId: string;
    }) => Promise<Record<string, unknown>>,
    extra: { modelId?: string; entryId?: string; fieldPath?: string; locale?: string } = {}
) {
    let ctx: Awaited<ReturnType<typeof prepare>> | undefined;
    try {
        ctx = await prepare(req, helper, cost);
        const result = await work(ctx);
        const { remaining } = deductCredits(ctx.projectId, cost, 'assist');
        appendAiAuditEvent({
            projectId: ctx.projectId,
            userId: ctx.user.id,
            userName: ctx.user.name ?? ctx.user.id,
            action,
            provider: provider(),
            creditsUsed: cost,
            creditsRemainingAfter: remaining,
            success: true,
            ...extra
        });
        res.json({ ...result, creditsUsed: cost, creditsRemaining: remaining });
    } catch (err) {
        if (ctx)
            appendAiAuditEvent({
                projectId: ctx.projectId,
                userId: ctx.user.id,
                userName: ctx.user.name ?? ctx.user.id,
                action,
                provider: provider(),
                creditsUsed: 0,
                creditsRemainingAfter: getCredits(ctx.projectId),
                success: false,
                errorMessage: err instanceof Error ? err.message : String(err),
                ...extra
            });
        if (err instanceof AiHelperError || err instanceof Refused)
            return void res.status(err.status).json({ error: err.message, code: err.code });
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('not found')) return void res.status(404).json({ error: message });
        if (message.includes('does not have access'))
            return void res.status(403).json({ error: message });
        console.error(`[moteur] AI ${action} failed:`, err);
        res.status(502).json({
            error: 'The AI provider could not answer. Try again.',
            code: 'AI_FAILED'
        });
    }
}

const contextOf = (project: ProjectSchema, projectId: string) => ({
    projectId,
    projectName: project.label,
    defaultLocale: project.defaultLocale,
    projectLocales: [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(Boolean),
    credits: { remaining: getCredits(projectId), used: 0 }
});

function writingCost(action: WritingAction, type: string): number {
    if (action === 'draft')
        return getCreditCost(type === 'core/rich-text' ? 'write.draft_long' : 'write.draft');
    if (action.startsWith('tone:')) return getCreditCost('write.tone');
    if (action === 'summarise-excerpt') return getCreditCost('write.summarise_excerpt');
    return getCreditCost(`write.${action}`);
}

export function createAssistRouter(ctx: PluginRouteContext): Router {
    const router = Router();

    // What this person may ask for in a project, and what each costs.
    router.get(
        '/helpers/:projectId',
        ctx.requireAuth,
        ctx.requireProjectAccess,
        async (req: Request, res: Response) => {
            const user = (req as Request & { user?: User }).user!;
            const projectId = (req.params as Record<string, string>).projectId;
            try {
                const project = await getProject(user, projectId);
                const adapter = await getAdapter();
                res.json({
                    ready: Boolean(adapter),
                    provider: adapter ? provider() : null,
                    helpers: helperStates(project, user),
                    describeUploads: project.ai?.autoAnalyseImages === true,
                    provenanceForAll: project.ai?.provenanceForAll === true,
                    credits: { remaining: getCredits(projectId), unlimited: isAiCreditsDisabled() },
                    costs: Object.fromEntries(
                        Object.keys(DEFAULT_CREDIT_COSTS).map(k => [k, getCreditCost(k)])
                    )
                });
            } catch (err) {
                res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
            }
        }
    );

    // Writing help on one field: returns the suggested text.
    router.post(
        '/write',
        ctx.requireAuth,
        ctx.requireProjectAccess,
        async (req: Request, res: Response) => {
            const { action, value, field, locale, body, modelId, entryId } = req.body ?? {};
            if (!WRITING_ACTIONS.includes(action))
                return void res
                    .status(400)
                    .json({ error: `"action" must be one of ${WRITING_ACTIONS.join(', ')}.` });
            const type = TEXT_TYPES.includes(field?.type) ? field.type : 'core/textarea';
            if (!field?.key || typeof field.key !== 'string')
                return void res.status(400).json({ error: '"field.key" is required.' });
            const cost = writingCost(action, type);
            await run(
                req,
                res,
                'write',
                `write.${action}`,
                cost,
                async ({ project, projectId }) => {
                    const text = await runWritingAction(
                        action,
                        typeof value === 'string' ? value : null,
                        {
                            key: field.key,
                            fieldKey: field.key,
                            label: String(field.label ?? field.key),
                            type
                        } as never,
                        { ...contextOf(project, projectId), entry: req.body?.entry } as never,
                        {
                            locale,
                            bodyValueForExcerpt: typeof body === 'string' ? body : undefined,
                            skipDeduction: true
                        }
                    );
                    return { text };
                },
                { modelId, entryId, fieldPath: field.key, locale }
            );
        }
    );

    // Translating one field's value from one language to another.
    router.post(
        '/translate/field',
        ctx.requireAuth,
        ctx.requireProjectAccess,
        async (req: Request, res: Response) => {
            const { value, from, to, field, modelId, entryId } = req.body ?? {};
            if (typeof value !== 'string' || !value.trim())
                return void res
                    .status(400)
                    .json({ error: '"value" must be the text to translate.' });
            if (typeof from !== 'string' || typeof to !== 'string' || from === to)
                return void res
                    .status(400)
                    .json({ error: '"from" and "to" must be two languages.' });
            const type = (
                TEXT_TYPES.includes(field?.type) ? field.type : 'core/textarea'
            ) as TranslatableFieldType;
            const cost = getCreditCost(
                type === 'core/rich-text' ? 'translate.rich_text' : 'translate.field'
            );
            await run(
                req,
                res,
                'translate',
                'translate.field',
                cost,
                async ({ project, projectId }) => ({
                    text: await translateField(
                        value,
                        type,
                        from,
                        to,
                        contextOf(project, projectId) as never,
                        {
                            skipDeduction: true
                        }
                    )
                }),
                { modelId, entryId, fieldPath: field?.key, locale: to }
            );
        }
    );

    // Suggested alt text (and caption) for a picture in the library.
    router.post(
        '/analyse/image',
        ctx.requireAuth,
        ctx.requireProjectAccess,
        async (req: Request, res: Response) => {
            const { assetId, locale, otherAlt } = req.body ?? {};
            if (typeof assetId !== 'string' || !assetId)
                return void res.status(400).json({ error: '"assetId" is required.' });
            await run(
                req,
                res,
                'alt',
                'analyse.image',
                getCreditCost('analyse.image'),
                async ({ project, projectId }) => {
                    const asset = await getAsset(projectId, assetId);
                    if (!asset || asset.type !== 'image')
                        throw new Refused(404, 'NOT_FOUND', 'Picture not found.');
                    const adapter = (await getAdapter())!;
                    const result = await analyseImage(adapter, asset.url, {
                        locale: typeof locale === 'string' ? locale : project.defaultLocale,
                        ...(typeof otherAlt === 'string' && otherAlt
                            ? { entryTitle: otherAlt }
                            : {})
                    });
                    return { alt: result.alt, caption: result.caption };
                },
                { locale }
            );
        }
    );

    return router;
}

const json = (schema: OpenAPIV3.SchemaObject) => ({ 'application/json': { schema } });
const errors: OpenAPIV3.ResponsesObject = {
    '400': { description: 'Bad request' },
    '402': { description: 'Not enough credits' },
    '403': {
        description:
            'Helper off for the project, or not for this role (code AI_HELPER_OFF / AI_HELPER_ROLE)'
    },
    '502': { description: 'The provider could not answer' },
    '503': { description: 'No AI provider on this server' }
};

export const assistOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/helpers/{projectId}': {
        get: {
            summary: 'Helpers this person may ask for in a project, with credits and costs',
            tags: ['AI'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description:
                        'Per helper: ok, off (for the project) or role (not for this person)',
                    content: json({ type: 'object' })
                }
            }
        }
    },
    '/write': {
        post: {
            summary: 'Suggest text for one field (shorter, longer, plainer, tone, excerpt, draft)',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['projectId', 'action', 'field'],
                    properties: {
                        projectId: { type: 'string' },
                        action: { type: 'string', enum: WRITING_ACTIONS },
                        value: { type: 'string' },
                        body: {
                            type: 'string',
                            description: 'For summarise-excerpt: the body text'
                        },
                        locale: { type: 'string' },
                        field: {
                            type: 'object',
                            properties: {
                                key: { type: 'string' },
                                label: { type: 'string' },
                                type: { type: 'string' }
                            }
                        }
                    }
                })
            },
            responses: {
                '200': {
                    description: 'The suggestion',
                    content: json({ type: 'object', properties: { text: { type: 'string' } } })
                },
                ...errors
            }
        }
    },
    '/translate/field': {
        post: {
            summary: 'Translate one field’s text into another language',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['projectId', 'value', 'from', 'to'],
                    properties: {
                        projectId: { type: 'string' },
                        value: { type: 'string' },
                        from: { type: 'string' },
                        to: { type: 'string' },
                        field: {
                            type: 'object',
                            properties: { key: { type: 'string' }, type: { type: 'string' } }
                        }
                    }
                })
            },
            responses: {
                '200': {
                    description: 'The translation',
                    content: json({ type: 'object', properties: { text: { type: 'string' } } })
                },
                ...errors
            }
        }
    },
    '/analyse/image': {
        post: {
            summary: 'Suggest alt text and a caption for a picture',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: json({
                    type: 'object',
                    required: ['projectId', 'assetId'],
                    properties: {
                        projectId: { type: 'string' },
                        assetId: { type: 'string' },
                        locale: { type: 'string' },
                        otherAlt: { type: 'string' }
                    }
                })
            },
            responses: {
                '200': {
                    description: 'Suggestions',
                    content: json({
                        type: 'object',
                        properties: { alt: { type: 'string' }, caption: { type: 'string' } }
                    })
                },
                ...errors
            }
        }
    }
};

import express, { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { getProject } from '@moteurio/core/projects.js';
import { getModelSchema } from '@moteurio/core/models.js';
import { appendAiAuditEvent } from '@moteurio/core/aiAuditLogger.js';
import { getAdapter, getCredits, deductCredits, getCreditCost } from '../../index.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

const MAX_FIELD_NEST_DEPTH = 12;

function cloneJsonSafe(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value)) as unknown;
    } catch {
        return undefined;
    }
}

/** Strip UI-only noise; keep type, labels, options (choices, multilingual…), nested block `data`. */
function compactFieldDef(def: unknown, depth: number): unknown {
    if (depth > MAX_FIELD_NEST_DEPTH) return { _note: 'nesting truncated' };
    if (def === null || typeof def !== 'object' || Array.isArray(def)) return def;
    const o = def as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (typeof o.type === 'string') out.type = o.type;
    if (typeof o.label === 'string') out.label = o.label;
    if (typeof o.description === 'string') out.description = o.description;
    if (o.options !== undefined && typeof o.options === 'object' && o.options !== null) {
        const opts = cloneJsonSafe(o.options);
        if (opts !== undefined) out.options = opts;
    }
    if (
        o.data !== undefined &&
        typeof o.data === 'object' &&
        o.data !== null &&
        !Array.isArray(o.data)
    ) {
        const nested: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o.data as Record<string, unknown>)) {
            nested[k] = compactFieldDef(v, depth + 1);
        }
        out.data = nested;
    }
    if (o.meta !== undefined && typeof o.meta === 'object' && o.meta !== null) {
        const meta = cloneJsonSafe(o.meta);
        if (meta !== undefined) out.meta = meta;
    }
    return out;
}

function compactFieldsRecord(fields: Record<string, any>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(fields)) {
        out[key] = compactFieldDef(def, 0);
    }
    return out;
}

function formatFieldListForPrompt(fields: Record<string, any>): string {
    return Object.entries(fields)
        .map(([key, def]) => {
            const type = def.type;
            const label = def.label || '';
            const description = def.description || '';
            return `- ${key} (${type}): ${label} — ${description}`;
        })
        .join('\n');
}

function valueShapeGuide(locale: string): string {
    const loc = locale || 'en';
    return [
        '### How to shape `data` values (follow each field `type` and `options` in the JSON below)',
        `- **Multilingual** (\`options.multilingual: true\`): locale objects, e.g. \`{ "${loc}": "text" }\` for the primary locale; add other keys only if the schema implies them.`,
        '- **Monolingual text**: plain string, or a single-locale object if that field type always uses locale maps.',
        '- **core/boolean** (and similar): often `{ "value": true }` or `{ "value": false }` when the schema uses a wrapper — follow `options` / patterns in the field JSON.',
        `- **core/image**: \`{ "src": "https://...", "alt": { "${loc}": "..." } }\` (placeholder URLs are fine).`,
        '- **core/rich-text**: HTML string, or per-locale HTML when multilingual.',
        '- **core/select** / **core/radio**: values must match `options.choices[].value` when `choices` are defined.',
        '- **References / relations**: plausible ids or slugs as strings when the schema expects references.',
        '- **Nested `data` on a field**: composite / block fields — fill sub-keys per the nested definitions.'
    ].join('\n');
}

/** Models often wrap JSON in ```json ... ```; strip before parse. */
function jsonPayloadFromModelText(raw: string): string {
    let t = raw.trim();
    t = t
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    return t;
}

function currentAiProviderId(): string {
    const v = (process.env.MOTEUR_AI_PROVIDER ?? '').trim().toLowerCase();
    return v || 'unknown';
}

function parseModelEntryJson(content: string): Record<string, unknown> {
    const jsonText = jsonPayloadFromModelText(content);
    try {
        return JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
        const start = jsonText.indexOf('{');
        const end = jsonText.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(jsonText.slice(start, end + 1)) as Record<string, unknown>;
        }
        throw new Error('Model response is not valid JSON');
    }
}

export function createEntryRouter(ctx: PluginRouteContext): Router {
    const router = express.Router({ mergeParams: true });
    router.post('/', ctx.requireProjectAccess, async (req: any, res: any) => {
        const { prompt, projectId, modelId, locale: localeFromBody = 'en' } = req.body;
        const pid = projectId || req.params.projectId;
        const mid = modelId || req.params.modelId;
        const locale =
            typeof localeFromBody === 'string' && localeFromBody.trim()
                ? localeFromBody.trim()
                : 'en';

        if (!prompt || !pid || !mid) {
            return res
                .status(400)
                .json({ error: 'Missing required parameters: prompt, projectId, modelId' });
        }

        const adapter = await getAdapter();
        if (!adapter?.generate) {
            return res.status(503).json({
                error: 'AI entry generation is disabled (no provider configured)'
            });
        }

        try {
            const project = await getProject(req.user!, pid);
            if (project.ai?.enabled === false) {
                return res.status(403).json({
                    error: 'AI is disabled for this project'
                });
            }
            const model = await getModelSchema(req.user!, pid, mid);
            if (!model) return res.status(404).json({ error: 'Model not found' });

            const fields = model.fields ?? {};
            const fieldList = formatFieldListForPrompt(fields);
            const fieldsSchemaJson = JSON.stringify(compactFieldsRecord(fields), null, 2);
            const modelBlurb = [
                `**${model.label}** (\`${model.id}\`)`,
                model.description?.trim() ? model.description.trim() : ''
            ]
                .filter(Boolean)
                .join(' — ');

            const systemPrompt = `
You are a structured content generator for a CMS called Moteur.

Content model: ${modelBlurb}.

Given a user prompt and the field definitions below, generate a complete content "entry".

Primary locale for examples: **${locale}**.

Each field in \`data\` must be populated with a realistic value that matches the field \`type\`, \`options\`, and any nested \`data\` sub-definitions.

Respond with valid JSON only — no markdown, no code fences, no explanation before or after.

Return JSON in this shape:
{
  "data": {
    "title": { "${locale}": "Example Title" },
    "coverImage": {
      "src": "https://example.com/cat.jpg",
      "alt": { "${locale}": "A cat" }
    },
    "published": { "value": true },
    ...
  }
}

${valueShapeGuide(locale)}

### Field summary (readable)
${fieldList}

### Field definitions (JSON — authoritative for structure, choices, multilingual flags, nested blocks)
${fieldsSchemaJson}
`.trim();

            const cost = getCreditCost('generate.entry');
            const balance = getCredits(pid);
            if (balance < cost) {
                return res.status(402).json({
                    error: 'insufficient_credits',
                    message: 'Not enough AI credits for entry generation'
                });
            }
            const { success } = deductCredits(pid, cost);
            if (!success) {
                return res.status(402).json({
                    error: 'insufficient_credits',
                    message: 'Not enough AI credits'
                });
            }

            const user = req.user!;
            const userPromptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);

            let rawResponse: string | undefined;
            try {
                const content = await adapter.generate(prompt, {
                    system: systemPrompt,
                    temperature: 0.6,
                    maxTokens: 4096
                });
                rawResponse = content;
                if (!content?.trim()) throw new Error('Empty response from AI');

                const parsed = parseModelEntryJson(content);
                parsed.type = mid;

                const remaining = getCredits(pid);
                appendAiAuditEvent({
                    projectId: pid,
                    userId: user.id,
                    userName: user.name ?? user.id,
                    action: 'generate.entry',
                    provider: currentAiProviderId(),
                    creditsUsed: cost,
                    creditsRemainingAfter: remaining,
                    success: true,
                    modelId: mid,
                    locale,
                    systemPrompt,
                    userPrompt: userPromptStr,
                    response: content
                });

                return res.json({
                    success: true,
                    entry: parsed,
                    creditsUsed: cost,
                    creditsRemaining: remaining
                });
            } catch (genErr: any) {
                appendAiAuditEvent({
                    projectId: pid,
                    userId: user.id,
                    userName: user.name ?? user.id,
                    action: 'generate.entry',
                    provider: currentAiProviderId(),
                    creditsUsed: cost,
                    creditsRemainingAfter: getCredits(pid),
                    success: false,
                    errorMessage: genErr?.message ?? String(genErr),
                    modelId: mid,
                    locale,
                    systemPrompt,
                    userPrompt: userPromptStr,
                    response: rawResponse
                });
                console.error('AI generate/entry failed:', genErr);
                return res
                    .status(500)
                    .json({ error: genErr?.message || 'AI entry generation failed' });
            }
        } catch (err: any) {
            console.error('AI generate/entry failed:', err);
            return res.status(500).json({ error: err.message || 'AI entry generation failed' });
        }
    });
    return router;
}

export const entryOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/generate/entry': {
        post: {
            summary: 'Generate an entry using AI based on model schema',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                prompt: { type: 'string' },
                                projectId: { type: 'string' },
                                modelId: { type: 'string' },
                                locale: { type: 'string', default: 'en' }
                            },
                            required: ['prompt', 'projectId', 'modelId']
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Entry generated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/AiGenerateEntrySuccess' }
                        }
                    }
                },
                '400': {
                    description: 'Missing parameters',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '402': {
                    description: 'Insufficient AI credits',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/AiInsufficientCreditsError' }
                        }
                    }
                },
                '403': {
                    description: 'AI disabled for project',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '404': {
                    description: 'Model not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '500': {
                    description: 'Generation failed',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '503': {
                    description: 'AI disabled (no provider)',
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

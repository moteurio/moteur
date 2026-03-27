import express, { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import fieldRegistry from '@moteurio/core/registry/FieldRegistry.js';
import { getAdapter } from '../../adapter.js';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';

function formatFieldSchemasForPrompt(fields: Record<string, any>): string {
    return JSON.stringify(
        Object.entries(fields).reduce(
            (acc, [key, def]) => {
                acc[key] = {
                    label: def.label,
                    description: def.description,
                    fields: def.fields,
                    meta: def.meta
                };
                return acc;
            },
            {} as Record<string, any>
        ),
        null,
        2
    );
}

export function createFieldsRouter(ctx: PluginRouteContext): Router {
    const router = express.Router({ mergeParams: true });
    router.post('/', ctx.requireOperator, async (req: any, res: any) => {
        const { prompt, currentFields } = req.body;

        if (!prompt || typeof currentFields !== 'object') {
            return res.status(400).json({ error: 'Missing or invalid prompt / currentFields' });
        }

        const adapter = await getAdapter();
        if (!adapter?.generate) {
            return res.status(503).json({
                error: 'AI generation is disabled (no provider configured)'
            });
        }

        try {
            const coreFieldDefs = fieldRegistry.all();
            const availableFieldTypes = formatFieldSchemasForPrompt(coreFieldDefs);
            const systemPrompt = `
You are a schema assistant for a headless CMS called Moteur.

Your job is to help generate new field definitions based on a user prompt.

You receive:
- A user prompt
- A current list of existing fields
- The available field types (see below)

Your response should ONLY be a valid JSON object like:
{
  "fields": {
    "slug": { "type": "core/text", "label": "Slug" },
    "seo": {
      "type": "core/structure",
      "label": "SEO Metadata",
      "schema": "core/seo"
    }
  }
}

⚠️ RULES:
- DO NOT delete or modify existing fields
- Use the field types exactly as defined below
- Use meaningful \`label\` values
- All returned field keys must be unique

Available field types:
${availableFieldTypes}
`;

            const userContent = `Prompt:\n${prompt}\n\nCurrent fields:\n${JSON.stringify(currentFields, null, 2)}`;
            const content = await adapter.generate(userContent, {
                system: systemPrompt,
                temperature: 0.4,
                maxTokens: 2048
            });
            if (!content?.trim()) throw new Error('Empty response from AI');

            const parsed = JSON.parse(content.trim());
            const mergedFields = { ...currentFields, ...parsed.fields };

            return res.json({ fields: mergedFields });
        } catch (err: any) {
            console.error('AI generate/fields failed:', err);
            return res.status(500).json({ error: err.message || 'AI field generation failed' });
        }
    });
    return router;
}

export const fieldsOpenapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/generate/fields': {
        post: {
            summary: 'Generate field definitions using AI',
            tags: ['AI'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                prompt: { type: 'string' },
                                currentFields: { type: 'object', additionalProperties: true }
                            },
                            required: ['prompt', 'currentFields']
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Fields generated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/AiGenerateFieldsSuccess' }
                        }
                    }
                },
                '503': {
                    description: 'AI disabled',
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

/** AI help: optional, on request, and nothing is saved without a person (`--json` for scripts). */
import { group, id, project, type ArgSpec } from '../spec.js';

const WRITING = [
    'draft',
    'rewrite',
    'shorten',
    'expand',
    'tone:formal',
    'tone:conversational',
    'tone:editorial',
    'summarise-excerpt'
] as const;

const fieldArgs: ArgSpec[] = [
    { name: 'field', description: 'The field’s key (title, excerpt…)', required: true, in: 'none' },
    {
        name: 'field-type',
        description: 'core/text, core/textarea or core/rich-text',
        default: 'core/textarea',
        in: 'none'
    },
    { name: 'model', description: 'The model, for context', in: 'body', key: 'modelId' },
    { name: 'entry', description: 'The entry, for context', in: 'body', key: 'entryId' }
];
const field = (args: Record<string, unknown>) => ({
    key: args.field,
    type: args['field-type'],
    label: args.field
});

export const ai = group('ai', [
    {
        name: 'status',
        summary: 'Whether AI is on, and with which provider',
        http: 'GET /ai/status',
        readOnly: true
    },
    {
        name: 'settings',
        summary: 'The project’s AI: provider and credits',
        args: [project],
        http: 'GET /ai/settings/{project}',
        readOnly: true
    },
    {
        name: 'helpers',
        summary: 'The helpers you may use here, with credits',
        args: [project],
        http: 'GET /ai/helpers/{project}',
        readOnly: true
    },
    {
        name: 'write',
        summary: 'Suggest text for a field: draft, rewrite, shorten, expand, change the tone',
        args: [
            project,
            {
                name: 'action',
                description: 'What to do',
                required: true,
                positional: 0,
                choices: WRITING,
                in: 'body'
            },
            ...fieldArgs,
            { name: 'value', description: 'The current text', in: 'body' },
            { name: 'locale', description: 'Its language', in: 'body' },
            {
                name: 'context',
                description: 'The rest of the entry’s text, for context',
                in: 'body',
                key: 'body'
            }
        ],
        projectInBody: true,
        run: async ctx => {
            const body = {
                ...(await ctx.body()),
                field: field(ctx.args),
                projectId: await ctx.project()
            };
            return (await ctx.client()).post('/ai/write', body);
        },
        covers: ['POST /ai/write'],
        examples: ['moteur ai write shorten --field excerpt --value "…" --locale fr']
    },
    {
        name: 'translate',
        summary: 'Translate a field’s text from one language to another',
        args: [
            project,
            { name: 'value', description: 'The text', required: true, positional: 0, in: 'body' },
            { name: 'from', description: 'From this language', required: true, in: 'body' },
            { name: 'to', description: 'Into this language', required: true, in: 'body' },
            { ...fieldArgs[0], required: false },
            ...fieldArgs.slice(1)
        ],
        run: async ctx => {
            const body = {
                ...(await ctx.body()),
                projectId: await ctx.project(),
                ...(ctx.args.field ? { field: field(ctx.args) } : {})
            };
            return (await ctx.client()).post('/ai/translate/field', body);
        },
        covers: ['POST /ai/translate/field']
    },
    {
        name: 'alt',
        summary: 'Suggest alt text and a caption for a picture',
        args: [
            project,
            { ...id('File', 'asset'), in: 'body', key: 'assetId' },
            { name: 'locale', description: 'In this language', in: 'body' },
            {
                name: 'other-alt',
                description: 'Its alt text in another language, as a hint',
                in: 'body',
                key: 'otherAlt'
            }
        ],
        projectInBody: true,
        http: 'POST /ai/analyse/image'
    },
    {
        name: 'image',
        summary: 'Make pictures from a description',
        args: [
            project,
            {
                name: 'prompt',
                description: 'What to make',
                required: true,
                positional: 0,
                in: 'body'
            },
            { name: 'ratio', description: 'Shape: 1:1, 16:9…', in: 'body', key: 'aspectRatio' },
            { name: 'count', type: 'number', description: 'How many', in: 'body' },
            { name: 'style', description: 'Style hints', in: 'body', key: 'styleHints' },
            { name: 'entry', description: 'The entry they’re for', in: 'body', key: 'entryId' }
        ],
        projectInBody: true,
        http: 'POST /ai/generate-image'
    },
    {
        name: 'audio',
        summary: 'Make speech from text',
        args: [
            project,
            {
                name: 'prompt',
                description: 'What to say',
                required: true,
                positional: 0,
                in: 'body'
            },
            { name: 'voice', description: 'Which voice', in: 'body' },
            { name: 'entry', description: 'The entry it’s for', in: 'body', key: 'entryId' },
            { name: 'field', description: 'The field it’s for', in: 'body', key: 'fieldPath' }
        ],
        projectInBody: true,
        http: 'POST /ai/generate-audio'
    },
    {
        name: 'model3d',
        summary: 'Make a 3D model from a description',
        args: [
            project,
            {
                name: 'prompt',
                description: 'What to make',
                required: true,
                positional: 0,
                in: 'body'
            },
            { name: 'textured', type: 'boolean', description: 'With textures', in: 'body' },
            { name: 'format', description: 'glb, usdz…', in: 'body' },
            { name: 'entry', description: 'The entry it’s for', in: 'body', key: 'entryId' },
            { name: 'field', description: 'The field it’s for', in: 'body', key: 'fieldPath' }
        ],
        projectInBody: true,
        http: 'POST /ai/generate-3d'
    },
    {
        name: 'keep-model',
        summary: 'Keep a generated 3D model in the media library',
        args: [
            project,
            {
                name: 'url',
                description: 'The model’s address (from model3d)',
                required: true,
                positional: 0,
                in: 'body'
            },
            { name: 'format', description: 'glb, usdz…', in: 'body' },
            { name: 'title', description: 'Title', in: 'body' },
            { name: 'prompt', description: 'What it was made from', in: 'body' },
            { name: 'thumbnail', description: 'Thumbnail address', in: 'body', key: 'thumbnailUrl' }
        ],
        projectInBody: true,
        http: 'POST /ai/save-generated-model'
    },
    {
        name: 'fields',
        summary: 'Suggest fields for a model (JSON with the current fields, or none)',
        args: [
            {
                name: 'prompt',
                description: 'What the model is for',
                required: true,
                positional: 0,
                in: 'body'
            }
        ],
        body: 'json',
        run: async ctx => {
            const body = await ctx.body();
            return (await ctx.client()).post('/ai/generate/fields', { currentFields: {}, ...body });
        },
        covers: ['POST /ai/generate/fields']
    },
    {
        name: 'entry',
        summary: 'Draft a whole entry for a model (shown, not saved)',
        args: [
            project,
            { name: 'model', description: 'Model id', required: true, in: 'body', key: 'modelId' },
            {
                name: 'prompt',
                description: 'What it’s about',
                required: true,
                positional: 0,
                in: 'body'
            },
            { name: 'locale', description: 'In this language', in: 'body' }
        ],
        projectInBody: true,
        http: 'POST /ai/generate/entry'
    },
    {
        name: 'audit',
        summary: 'What AI was asked in the project (prompts for operators)',
        args: [
            project,
            { name: 'limit', type: 'number', description: 'How many', in: 'query' },
            { name: 'before', description: 'Older than (ISO)', in: 'query' }
        ],
        http: 'GET /projects/{project}/ai-audit',
        readOnly: true
    },
    {
        name: 'audit-event',
        summary: 'One AI event in full',
        args: [project, id('Event', 'event')],
        http: 'GET /projects/{project}/ai-audit/{event}',
        readOnly: true
    }
]);

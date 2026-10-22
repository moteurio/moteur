/** Entries and the models they follow. */
import { group, id, model, project, type ArgSpec, type Column } from '../spec.js';
import { crud, revisions, setPairs, SET_ARG } from '../kit.js';
import { localized } from '../format.js';
import { fillPath } from '../execute.js';

const ENTRY = '/projects/{project}/models/{model}/entries/{id}';

/** A row's title: its title, name or label field, else its id. */
const titleOf = (_: unknown, row: Record<string, unknown>) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    for (const k of ['title', 'name', 'label', 'headline', 'question'])
        if (data[k]) return localized(data[k]);
    return String(row.id ?? '');
};

/** published + newer saves reads as "published · edits". */
const stateOf = (_: unknown, row: Record<string, unknown>) => {
    const audit = (
        (row.meta ?? {}) as { audit?: { revision?: number; publishedRevision?: number } }
    ).audit;
    const edits =
        row.status === 'published' &&
        audit?.revision != null &&
        audit.publishedRevision != null &&
        audit.revision > audit.publishedRevision;
    return `${row.status ?? 'draft'}${edits ? ' · edits' : ''}`;
};

const ENTRY_TABLE: Column[] = [
    { key: 'id', header: 'id' },
    { key: 'status', header: 'status', format: stateOf },
    { key: 'data', header: 'title', format: titleOf },
    { key: 'meta.audit.updatedAt', header: 'updated' }
];

/** `moteur entries get <model> <id>`. */
const modelFirst: ArgSpec = { ...model, positional: 0 };
const entryId: ArgSpec = { ...id('Entry'), positional: 1 };

/** `--filter author=sophie --filter status=…` as the engine's `filter.<key>=a,b`. */
function filters(values: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of (values as string[] | undefined) ?? []) {
        const at = pair.indexOf('=');
        if (at < 1) throw new Error(`--filter takes key=value, not "${pair}"`);
        const key = pair.slice(0, at) === 'status' ? '$workflow' : pair.slice(0, at);
        const value = pair.slice(at + 1);
        out[`filter.${key}`] = out[`filter.${key}`] ? `${out[`filter.${key}`]},${value}` : value;
    }
    return out;
}

export const entries = group('entries', [
    {
        name: 'list',
        summary: 'List a model’s entries: search, filter, sort, page',
        args: [
            project,
            { ...model, positional: 0 },
            {
                name: 'q',
                description: 'Words to find in the id and short text fields',
                in: 'query',
                aliases: ['search']
            },
            {
                name: 'status',
                type: 'list',
                description: 'Only these states: draft, in_review, published, unpublished, edits',
                in: 'query'
            },
            {
                name: 'filter',
                type: 'list',
                description: 'field=value (repeat for more; several values of one field match any)',
                in: 'none'
            },
            {
                name: 'missing',
                description: 'Entries missing languages in a field: title:fr,en',
                in: 'query'
            },
            {
                name: 'sort',
                description:
                    'updatedAt, createdAt, publishedAt, id or data.<field>; - for descending',
                in: 'query',
                default: '-updatedAt'
            },
            {
                name: 'sort-locale',
                description: 'Language for a data.<field> sort',
                in: 'query',
                key: 'sortLocale'
            },
            {
                name: 'facets',
                type: 'list',
                description: 'Count matching entries per value of these keys',
                in: 'query'
            },
            { name: 'fields', type: 'list', description: 'Only these data fields', in: 'query' },
            { name: 'group', description: 'Group rows by this key', in: 'query' },
            {
                name: 'limit',
                type: 'number',
                description: 'How many to return (0: only the total)',
                in: 'query',
                default: 50
            },
            { name: 'offset', type: 'number', description: 'How many to skip', in: 'query' }
        ],
        run: async ctx => {
            const params: Record<string, unknown> = {};
            for (const k of ['q', 'missing', 'sort', 'group', 'limit', 'offset'])
                if (ctx.args[k] !== undefined) params[k] = ctx.args[k];
            if (ctx.args['sort-locale']) params.sortLocale = ctx.args['sort-locale'];
            for (const k of ['status', 'facets', 'fields'] as const) {
                if (ctx.args[k]) params[k] = (ctx.args[k] as string[]).join(',');
            }
            Object.assign(params, filters(ctx.args.filter));
            const client = await ctx.client();
            return client.get(
                fillPath(
                    '/projects/{project}/models/{model}/entries',
                    ctx.args,
                    await ctx.project()
                ),
                params as Record<string, string>
            );
        },
        covers: ['GET /projects/{project}/models/{model}/entries'],
        pick: 'entries',
        table: ENTRY_TABLE,
        readOnly: true,
        examples: [
            'moteur entries list article --q glace',
            'moteur entries list article --status in_review --filter author=sophie --json'
        ]
    },
    {
        name: 'get',
        summary: 'Show one entry',
        args: [project, modelFirst, entryId],
        http: `GET ${ENTRY}`,
        readOnly: true
    },
    {
        name: 'create',
        summary: 'Create an entry from its JSON ({ id, data, … }) and/or fields to set',
        args: [
            project,
            modelFirst,
            { name: 'id', description: 'The new entry’s id', in: 'none', positional: 1 },
            { name: 'status', description: 'draft (default) or published', in: 'none' },
            SET_ARG
        ],
        body: 'json',
        run: async ctx => {
            const body = await ctx.body();
            const data = {
                ...((body.data as Record<string, unknown>) ?? {}),
                ...setPairs(ctx.args.set)
            };
            const entry = {
                ...body,
                type: ctx.args.model,
                data,
                ...(ctx.args.id ? { id: ctx.args.id } : {}),
                ...(ctx.args.status ? { status: ctx.args.status } : {})
            };
            if (!entry.id) throw new Error('The entry needs an id: --id=<id>, or "id" in the JSON');
            const client = await ctx.client();
            return client.post(
                fillPath(
                    '/projects/{project}/models/{model}/entries',
                    ctx.args,
                    await ctx.project()
                ),
                entry
            );
        },
        covers: ['POST /projects/{project}/models/{model}/entries'],
        done: (_r, a) => `Created ${a.model}/${a.id ?? ''}.`.replace(/\/\.$/, '.'),
        examples: [
            'moteur entries create article --id glace --set title.fr="Sous la glace"',
            'moteur entries create article --file entry.json'
        ]
    },
    {
        name: 'update',
        summary: 'Change fields of an entry: fields to set (title.en=…), or JSON { data: {…} }',
        args: [project, modelFirst, entryId, SET_ARG],
        body: 'json',
        run: async ctx => {
            const body = await ctx.body();
            const set = setPairs(ctx.args.set);
            const patch = Object.keys(set).length
                ? { ...body, data: { ...((body.data as Record<string, unknown>) ?? {}), ...set } }
                : body;
            if (!Object.keys(patch).length)
                throw new Error(
                    'Nothing to change: add --set field=value, or JSON with --file/--data'
                );
            const client = await ctx.client();
            return client.patch(fillPath(ENTRY, ctx.args, await ctx.project()), patch);
        },
        covers: [`PATCH ${ENTRY}`],
        done: (_r, a) => `Saved ${a.model}/${a.id}.`,
        examples: ['moteur entries update article glace --set title.en="Under the ice"']
    },
    {
        name: 'delete',
        summary: 'Delete an entry',
        args: [project, modelFirst, entryId],
        http: `DELETE ${ENTRY}`,
        destructive: true,
        done: (_r, a) => `Deleted ${a.model}/${a.id}.`
    },
    {
        name: 'publish',
        summary: 'Publish an entry: what is saved now goes live',
        args: [project, modelFirst, entryId],
        http: `POST ${ENTRY}/publish`,
        done: (_r, a) => `${a.model}/${a.id} is live.`
    },
    {
        name: 'status',
        summary: 'Set an entry’s state (draft, in_review, published, unpublished)',
        args: [
            project,
            modelFirst,
            entryId,
            {
                name: 'to',
                description: 'The new state',
                required: true,
                positional: 2,
                choices: ['draft', 'in_review', 'published', 'unpublished'],
                in: 'body',
                key: 'status'
            }
        ],
        http: `PATCH ${ENTRY}/status`,
        done: (_r, a) => `${a.model}/${a.id} is now ${a.to}.`
    },
    {
        name: 'unpublish',
        summary: 'Take an entry offline (it stays as it is)',
        args: [project, modelFirst, entryId],
        covers: [`PATCH ${ENTRY}/status`],
        run: async ctx => {
            const client = await ctx.client();
            return client.patch(fillPath(`${ENTRY}/status`, ctx.args, await ctx.project()), {
                status: 'unpublished'
            });
        },
        destructive: true,
        done: (_r, a) => `${a.model}/${a.id} is offline.`
    },
    {
        name: 'review',
        summary: 'Ask for a review of an entry',
        args: [
            project,
            modelFirst,
            entryId,
            {
                name: 'reviewer',
                description: 'Someone in particular (user id)',
                in: 'body',
                key: 'assignedTo'
            }
        ],
        http: `POST ${ENTRY}/submit-review`,
        done: (_r, a) => `Review asked for ${a.model}/${a.id}.`
    },
    ...revisions({ noun: 'entry', path: ENTRY, ids: [modelFirst, entryId] })
]);

export const models = group('models', [
    ...crud({
        noun: 'model',
        base: '/projects/{project}/models',
        idName: 'model',
        pick: 'models',
        table: [
            { key: 'id', header: 'id' },
            { key: 'label', header: 'label', format: localized },
            { key: 'modelType', header: 'type' },
            {
                key: 'fields',
                header: 'fields',
                format: v => String(Object.keys((v as object) ?? {}).length)
            }
        ]
    }),
    ...revisions({
        noun: 'model',
        path: '/projects/{project}/models/{model}',
        ids: [{ ...model, positional: 0 }]
    })
]);

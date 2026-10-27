/** What content is made of: templates, layouts, structures, blocks, forms, menus, field types. */
import fs from 'fs';
import { group, id, project, type ArgSpec } from '../spec.js';
import { crud, revisions } from '../kit.js';
import { localized } from '../format.js';
import { fillPath } from '../execute.js';

const P = '/projects/{project}';
const first = (what: string, name = 'id'): ArgSpec => ({ ...id(what, name), positional: 0 });

export const templates = group('templates', [
    ...crud({ noun: 'template', base: `${P}/templates`, replace: true }),
    {
        name: 'validate',
        summary: 'Check a template for problems',
        args: [project, first('Template')],
        http: `POST ${P}/templates/{id}/validate`,
        readOnly: true
    },
    ...revisions({ noun: 'template', path: `${P}/templates/{id}`, ids: [first('Template')] })
]);

export const layouts = group('layouts', [
    ...crud({ noun: 'layout', base: `${P}/layouts`, idName: 'layout' }),
    ...revisions({
        noun: 'layout',
        path: `${P}/layouts/{layout}`,
        ids: [first('Layout', 'layout')]
    })
]);

export const structures = group('structures', [
    ...crud({ noun: 'structure', base: `${P}/structures` }),
    ...revisions({ noun: 'structure', path: `${P}/structures/{id}`, ids: [first('Structure')] })
]);

const BLOCK_TABLE = [
    { key: 'type', header: 'type' },
    { key: 'label', header: 'label', format: localized },
    { key: 'category', header: 'category' }
];

export const blocks = group('blocks', [
    ...crud({
        noun: 'block',
        base: `${P}/blocks`,
        idName: 'slug',
        replace: true,
        table: BLOCK_TABLE
    }),
    ...revisions({ noun: 'block', path: `${P}/blocks/{slug}`, ids: [first('Block', 'slug')] }),
    {
        name: 'core',
        summary: 'The server’s own block types',
        http: 'GET /moteur/blocks',
        table: BLOCK_TABLE,
        readOnly: true
    },
    {
        name: 'register',
        summary: 'Add a block type for the whole server (operators)',
        body: 'json',
        http: 'POST /moteur/blocks'
    }
]);

export const forms = group('forms', [
    ...crud({
        noun: 'form',
        base: `${P}/forms`,
        idName: 'form',
        pick: 'forms',
        table: [
            { key: 'id', header: 'id' },
            { key: 'label', header: 'label', format: localized },
            { key: 'status', header: 'status' }
        ]
    }),
    ...revisions({ noun: 'form', path: `${P}/forms/{form}`, ids: [first('Form', 'form')] })
]);

const SUB = `${P}/forms/{form}/submissions`;
const formArg: ArgSpec = {
    name: 'form',
    description: 'Form id',
    required: true,
    positional: 0,
    aliases: ['formId']
};
const submissionArg: ArgSpec = { ...id('Submission'), positional: 1 };

export const submissions = group('submissions', [
    {
        name: 'list',
        summary: 'What people sent through a form',
        args: [
            project,
            formArg,
            { name: 'unread', type: 'boolean', description: 'Only unread ones', in: 'query' },
            { name: 'status', description: 'received, spam…', in: 'query' },
            { name: 'limit', type: 'number', description: 'How many', in: 'query' },
            { name: 'offset', type: 'number', description: 'How many to skip', in: 'query' }
        ],
        http: `GET ${SUB}`,
        pick: 'submissions',
        table: [
            { key: 'id', header: 'id' },
            { key: 'createdAt', header: 'sent' },
            { key: 'read', header: 'read' },
            { key: 'spam', header: 'spam' },
            { key: 'data', header: 'data', format: v => JSON.stringify(v ?? {}).slice(0, 60) }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'Show one submission',
        args: [project, formArg, submissionArg],
        http: `GET ${SUB}/{id}`,
        readOnly: true
    },
    {
        name: 'mark',
        summary: 'Mark a submission read or unread, spam or not',
        args: [
            project,
            formArg,
            submissionArg,
            { name: 'read', type: 'boolean', description: 'Read (--no-read: unread)', in: 'body' },
            { name: 'spam', type: 'boolean', description: 'Spam (--no-spam: not spam)', in: 'body' }
        ],
        http: `PATCH ${SUB}/{id}`,
        done: () => 'Marked.'
    },
    {
        name: 'delete',
        summary: 'Delete a submission',
        args: [project, formArg, submissionArg],
        http: `DELETE ${SUB}/{id}`,
        destructive: true,
        done: () => 'Deleted.'
    },
    {
        name: 'export',
        summary: 'Every submission of a form, as CSV or JSON (or written to a file)',
        args: [
            project,
            formArg,
            {
                name: 'format',
                choices: ['csv', 'json'],
                default: 'csv',
                description: 'File format',
                in: 'query'
            },
            {
                name: 'out',
                description: 'Write it to this file instead of printing it',
                in: 'none',
                local: true
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const text = await client.request<string>({
                method: 'GET',
                url: fillPath(`${SUB}/export`, ctx.args, await ctx.project()),
                params: { format: ctx.args.format },
                responseType: 'text'
            });
            if (ctx.args.out) {
                if (!ctx.local) throw new Error('Files can’t be written here: leave out out.');
                fs.writeFileSync(
                    String(ctx.args.out),
                    typeof text === 'string' ? text : JSON.stringify(text, null, 2)
                );
                return `Wrote ${ctx.args.out}.`;
            }
            return typeof text === 'string' ? text : JSON.stringify(text, null, 2);
        },
        covers: [`GET ${SUB}/export`],
        readOnly: true
    }
]);

export const menus = group('menus', [
    ...crud({
        noun: 'menu',
        base: `${P}/navigations`,
        pick: 'navigations',
        table: [
            { key: 'id', header: 'id' },
            { key: 'handle', header: 'handle' },
            { key: 'name', header: 'name', format: localized },
            {
                key: 'items',
                header: 'items',
                format: v => String((v as unknown[] | undefined)?.length ?? 0)
            }
        ]
    })
]);

export const fieldTypes = group('field-types', [
    {
        name: 'list',
        summary: 'Every field type the server knows, with its options',
        http: 'GET /studio/field-types',
        pick: 'types',
        table: [
            { key: 'type', header: 'type' },
            { key: 'label', header: 'label' },
            { key: 'description', header: 'description', format: v => String(v ?? '').slice(0, 70) }
        ],
        readOnly: true
    }
]);

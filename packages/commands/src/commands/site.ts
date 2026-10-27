/** Pages, and what the site is made of once published: addresses, sitemap, navigation. */
import { group, id, project, type ArgSpec } from '../spec.js';
import { crud, revisions } from '../kit.js';
import { localized } from '../format.js';
import { fillPath } from '../execute.js';

const P = '/projects/{project}';
const pageArg: ArgSpec = { ...id('Page'), positional: 0 };
const locale: ArgSpec = {
    name: 'locale',
    description: 'In this language (e.g. fr)',
    in: 'query',
    aliases: ['lang']
};
const redirectArg: ArgSpec = { ...id('Redirect'), positional: 0 };

export const pages = group('pages', [
    ...crud({
        noun: 'page',
        base: `${P}/pages`,
        replace: true,
        pick: 'pages',
        listArgs: [
            {
                name: 'template',
                description: 'Only pages of this template',
                in: 'query',
                key: 'templateId'
            },
            {
                name: 'parent',
                description: 'Only children of this page',
                in: 'query',
                key: 'parentId'
            },
            { name: 'status', description: 'draft, published…', in: 'query' },
            { name: 'type', description: 'Page type', in: 'query' }
        ],
        table: [
            { key: 'id', header: 'id' },
            { key: 'slug', header: 'slug', format: localized },
            { key: 'label', header: 'label', format: localized },
            { key: 'status', header: 'status' },
            { key: 'parentId', header: 'parent' }
        ]
    }),
    {
        name: 'by-slug',
        summary: 'Find a page by its slug',
        args: [
            project,
            { name: 'slug', description: 'The slug', required: true, positional: 0 },
            locale
        ],
        http: `GET ${P}/pages/by-slug/{slug}`,
        readOnly: true
    },
    {
        name: 'referrers',
        summary: 'What links to a page: entries and other pages (check before deleting it)',
        args: [project, pageArg],
        http: `GET ${P}/pages/{id}/referrers`,
        pick: 'referrers',
        table: [
            {
                key: 'from',
                header: 'from',
                format: v => {
                    const f = v as { kind: string; id: string; label?: string };
                    return `${f.kind} ${f.label ?? f.id}`;
                }
            },
            { key: 'path', header: 'field' },
            { key: 'via', header: 'as' }
        ],
        readOnly: true
    },
    {
        name: 'status',
        summary: 'Set a page’s state (draft, published…)',
        args: [
            project,
            pageArg,
            {
                name: 'to',
                description: 'The new state',
                required: true,
                positional: 1,
                in: 'body',
                key: 'status'
            }
        ],
        http: `PATCH ${P}/pages/{id}/status`,
        done: (_r, a) => `${a.id} is now ${a.to}.`
    },
    {
        name: 'review',
        summary: 'Ask for a review of a page',
        args: [project, pageArg],
        http: `POST ${P}/pages/{id}/submit-review`,
        done: (_r, a) => `Review asked for ${a.id}.`
    },
    {
        name: 'reorder',
        summary: 'Move pages in the tree (JSON: [{ id, parentId, order }…])',
        args: [project],
        body: 'json',
        http: `POST ${P}/pages/reorder`,
        done: () => 'Reordered.'
    },
    {
        name: 'validate',
        summary: 'Check a page for problems',
        args: [project, pageArg],
        http: `POST ${P}/pages/{id}/validate`,
        readOnly: true
    },
    {
        name: 'validate-all',
        summary: 'Check every page',
        args: [project],
        http: `POST ${P}/pages/validate-all`,
        readOnly: true
    },
    ...revisions({ noun: 'page', path: `${P}/pages/{id}`, ids: [pageArg] })
]);

export const site = group('site', [
    {
        name: 'urls',
        summary: 'Every published address of the site, in every language',
        args: [project, locale],
        http: `GET ${P}/urls`,
        pick: 'urls',
        table: [
            { key: 'url', header: 'address' },
            { key: 'kind', header: 'kind' },
            { key: 'locale', header: 'language' }
        ],
        readOnly: true
    },
    {
        name: 'sitemap',
        summary: 'The sitemap, as XML (default) or JSON',
        args: [
            project,
            {
                name: 'format',
                choices: ['xml', 'json'],
                default: 'xml',
                description: 'Format',
                in: 'none'
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const url = fillPath(`${P}/sitemap.${ctx.args.format}`, ctx.args, await ctx.project());
            return client.request({
                method: 'GET',
                url,
                responseType: ctx.args.format === 'xml' ? 'text' : 'json'
            });
        },
        covers: [`GET ${P}/sitemap.xml`, `GET ${P}/sitemap.json`],
        readOnly: true
    },
    {
        name: 'navigation',
        summary: 'The page tree as the site navigates it',
        args: [
            project,
            { name: 'depth', type: 'number', description: 'How deep', in: 'query' },
            { name: 'root', description: 'Start from this page', in: 'query', key: 'rootId' },
            locale
        ],
        http: `GET ${P}/navigation`,
        readOnly: true
    },
    {
        name: 'breadcrumb',
        summary: 'The trail to a page (and an entry shown on it)',
        args: [
            project,
            {
                name: 'page',
                description: 'Page id',
                required: true,
                in: 'query',
                key: 'pageId',
                positional: 0
            },
            {
                name: 'entry',
                description: 'Entry id shown on the page',
                in: 'query',
                key: 'entryId'
            },
            locale
        ],
        http: `GET ${P}/breadcrumb`,
        readOnly: true
    },
    {
        name: 'resolve',
        summary: 'What lives at an address: a page or entry (and its language), or a redirect',
        args: [
            project,
            {
                name: 'path',
                description: 'The address, e.g. /fr/a-propos',
                required: true,
                positional: 0,
                in: 'query'
            }
        ],
        http: `GET ${P}/resolve`,
        readOnly: true
    },
    {
        name: 'redirects',
        summary: 'Old addresses and where they go',
        args: [project],
        http: `GET ${P}/redirects`,
        table: [
            { key: 'from', header: 'from' },
            { key: 'to', header: 'to' },
            { key: 'status', header: 'status' },
            { key: 'auto', header: 'auto', format: v => (v ? 'yes' : '') }
        ],
        readOnly: true
    },
    {
        name: 'redirect-add',
        summary: 'Send an old address somewhere else',
        args: [
            project,
            {
                name: 'from',
                description: 'The old path, e.g. /old-about',
                required: true,
                positional: 0,
                in: 'body'
            },
            {
                name: 'to',
                description: 'A path on the site, or an http(s) address',
                required: true,
                positional: 1,
                in: 'body'
            },
            {
                name: 'status',
                type: 'number',
                description: '301 permanent (default), 302 temporary',
                in: 'body'
            },
            { name: 'note', description: 'Why it exists', in: 'body' }
        ],
        http: `POST ${P}/redirects`
    },
    {
        name: 'redirect-update',
        summary: 'Change where a redirect goes',
        args: [
            project,
            redirectArg,
            { name: 'from', description: 'The old path', in: 'body' },
            { name: 'to', description: 'Where it goes', in: 'body' },
            {
                name: 'status',
                type: 'number',
                description: '301 permanent, 302 temporary',
                in: 'body'
            },
            { name: 'note', description: 'Why it exists', in: 'body' }
        ],
        http: `PATCH ${P}/redirects/{id}`
    },
    {
        name: 'redirect-delete',
        summary: 'Remove a redirect',
        args: [project, redirectArg],
        http: `DELETE ${P}/redirects/{id}`,
        destructive: true
    }
]);

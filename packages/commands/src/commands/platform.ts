/** Who you are, the server around the projects, and the escape hatch for everything else. */
import { group, id, project, type ArgSpec, type CommandSpec } from '../spec.js';
import { localized } from '../format.js';
import { fillPath, UsageError } from '../execute.js';
import { setPairs } from '../kit.js';
import { loadConfig, saveConfig } from '../config.js';

const P = '/projects/{project}';

export const auth = group('auth', [
    {
        name: 'whoami',
        summary: 'Who you are signed in as, and where',
        http: 'GET /auth/me',
        readOnly: true,
        done: r => {
            const u = (r as { user?: { name?: string; email?: string; roles?: string[] } }).user;
            return `${u?.name ?? ''} <${u?.email ?? ''}>${u?.roles?.length ? `  ${u.roles.join(', ')}` : ''}`;
        }
    },
    {
        name: 'providers',
        summary: 'The sign-in options the server offers',
        http: 'GET /auth/providers',
        readOnly: true,
        offline: true
    },
    {
        name: 'refresh',
        summary: 'Swap the remembered token for a fresh one',
        run: async ctx => {
            const { token } = await (await ctx.client()).auth.refresh();
            const config = await loadConfig();
            await saveConfig({ ...config, token });
            return null;
        },
        covers: ['POST /auth/refresh'],
        done: () => 'Token refreshed.'
    },
    {
        name: 'agent-token',
        summary: 'A token for an AI agent acting for you (for the hosted MCP at /mcp)',
        description:
            'What the agent changes reads “<you> via <name>”, is marked until a person reads it, and goes live only once a person approves it, unless --allow-publish. Lasts up to 8 hours.',
        args: [
            {
                name: 'name',
                description: 'Who its changes are marked as made by',
                default: 'Claude',
                positional: 0,
                in: 'none'
            },
            {
                name: 'allow-publish',
                type: 'boolean',
                description: 'Let its changes go live without a person approving them',
                in: 'none'
            },
            {
                name: 'hours',
                type: 'number',
                description: 'How long it lasts, up to 8',
                default: 8,
                in: 'none'
            }
        ],
        pick: 'sessionToken',
        run: async ctx =>
            (await ctx.client()).request({
                method: 'POST',
                url: '/auth/session-token',
                data: {
                    ttlSeconds: Math.round(
                        Math.min(Math.max(Number(ctx.args.hours), 0.1), 8) * 3600
                    ),
                    agent: { name: ctx.args.name, reviewOnly: ctx.args['allow-publish'] !== true }
                }
            }),
        covers: ['POST /auth/session-token']
    }
]);

const KINDS = ['project', 'model', 'structure', 'template'] as const;
const kindArg: ArgSpec = {
    name: 'kind',
    description: 'project, model, structure or template',
    required: true,
    choices: KINDS,
    positional: 0
};
const blueprintArg: ArgSpec = { ...id('Blueprint'), positional: 1 };
const everyKind = (method: string, suffix = '') =>
    KINDS.map(k => `${method} /blueprints/${k}s${suffix}`);

export const blueprints = group('blueprints', [
    {
        name: 'list',
        summary: 'Blueprints of a kind',
        args: [kindArg],
        http: 'GET /blueprints/{kind}s',
        covers: everyKind('GET'),
        pick: 'blueprints',
        table: [
            { key: 'id', header: 'id' },
            { key: 'name', header: 'name', format: localized },
            { key: 'description', header: 'description', format: v => localized(v).slice(0, 60) }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'Show a blueprint',
        args: [kindArg, blueprintArg],
        http: 'GET /blueprints/{kind}s/{id}',
        covers: everyKind('GET', '/{id}'),
        readOnly: true
    },
    {
        name: 'create',
        summary: 'Create a blueprint (JSON: { id, name, description, template })',
        args: [kindArg],
        body: 'json',
        http: 'POST /blueprints/{kind}s',
        covers: everyKind('POST')
    },
    {
        name: 'update',
        summary: 'Change a blueprint (JSON with the fields to change)',
        args: [kindArg, blueprintArg],
        body: 'json',
        http: 'PATCH /blueprints/{kind}s/{id}',
        covers: everyKind('PATCH', '/{id}')
    },
    {
        name: 'delete',
        summary: 'Delete a blueprint',
        args: [kindArg, blueprintArg],
        http: 'DELETE /blueprints/{kind}s/{id}',
        covers: everyKind('DELETE', '/{id}'),
        destructive: true
    }
]);

const SCHEMA_KINDS = ['blocks', 'structures'] as const;

export const operator = group('operator', [
    {
        name: 'operators',
        summary: 'The operators: who runs this server',
        http: 'GET /operator/operators',
        pick: 'operators',
        table: [
            { key: 'email', header: 'email' },
            { key: 'name', header: 'name' },
            { key: 'enrolled', header: 'set up', format: v => (v ? 'yes' : 'not yet') },
            { key: 'lastLoginAt', header: 'last sign-in' }
        ],
        readOnly: true
    },
    {
        name: 'add-operator',
        summary: 'Add an operator; prints their one-time link (24 hours)',
        args: [
            {
                name: 'email',
                description: 'Their email',
                required: true,
                positional: 0,
                in: 'body'
            },
            { name: 'name', description: 'Their name', in: 'body' }
        ],
        http: 'POST /operator/operators',
        done: r =>
            `Send them this, privately (it works once, for 24 hours): <studio>/operator/enroll/${(r as { enrollToken: string }).enrollToken}`
    },
    {
        name: 'reset-operator',
        summary: 'Start an operator’s sign-in again (lost phone): ends their sessions, new link',
        args: [
            {
                name: 'id',
                description: 'Their id (moteur operator operators --json)',
                required: true,
                positional: 0
            }
        ],
        http: 'POST /operator/operators/{id}/reset',
        destructive: true,
        done: r =>
            `Their new one-time link: <studio>/operator/enroll/${(r as { enrollToken: string }).enrollToken}`
    },
    {
        name: 'remove-operator',
        summary: 'Remove an operator; their sessions end at once',
        args: [{ name: 'id', description: 'Their id', required: true, positional: 0 }],
        http: 'DELETE /operator/operators/{id}',
        destructive: true,
        done: () => 'Removed.'
    },
    {
        name: 'summary',
        summary: 'The whole server at a glance',
        http: 'GET /operator/summary',
        readOnly: true
    },
    {
        name: 'users',
        summary: 'Every account',
        http: 'GET /operator/users',
        pick: 'users',
        table: [
            { key: 'id', header: 'id' },
            { key: 'name', header: 'name' },
            { key: 'email', header: 'email' },
            { key: 'roles', header: 'roles', format: v => ((v as string[]) ?? []).join(', ') },
            { key: 'isActive', header: 'active' }
        ],
        readOnly: true
    },
    {
        name: 'update-user',
        summary: 'Change an account (JSON, or active and roles)',
        args: [
            id('User'),
            {
                name: 'active',
                type: 'boolean',
                description: 'Account on (--no-active: off)',
                in: 'body',
                key: 'isActive'
            },
            { name: 'roles', type: 'list', description: 'Account roles', in: 'body' }
        ],
        body: 'json',
        http: 'PATCH /operator/users/{id}'
    },
    {
        name: 'projects',
        summary: 'Every project on the server',
        http: 'GET /operator/projects',
        pick: 'projects',
        table: [
            { key: 'id', header: 'id' },
            { key: 'label', header: 'label', format: localized }
        ],
        readOnly: true
    },
    {
        name: 'project-plugins',
        summary: 'Set which plugins a project may use (JSON)',
        args: [{ ...project, required: true, positional: 0 }],
        body: 'json',
        http: `PATCH /operator${P}`
    },
    {
        name: 'plugins',
        summary: 'Every plugin the server knows of',
        http: 'GET /operator/plugins',
        readOnly: true
    },
    {
        name: 'plugin',
        summary: 'Switch a host plugin on or off',
        args: [
            id('Plugin'),
            {
                name: 'enabled',
                type: 'boolean',
                description: 'On (--no-enabled: off)',
                required: true,
                in: 'body'
            }
        ],
        http: 'PATCH /operator/plugins/{id}'
    },
    {
        name: 'schemas',
        summary: 'Server-wide blocks or structures',
        args: [
            {
                name: 'kind',
                description: 'blocks or structures',
                choices: SCHEMA_KINDS,
                required: true,
                positional: 0
            }
        ],
        http: 'GET /operator/schemas/{kind}',
        readOnly: true
    },
    {
        name: 'put-schema',
        summary: 'Add or change a server-wide block or structure (JSON)',
        args: [
            {
                name: 'kind',
                description: 'blocks or structures',
                choices: SCHEMA_KINDS,
                required: true,
                positional: 0
            },
            { name: 'name', description: 'Its name', required: true, positional: 1 }
        ],
        body: 'json',
        http: 'PUT /operator/schemas/{kind}/{name}'
    },
    {
        name: 'delete-schema',
        summary: 'Remove a server-wide block or structure',
        args: [
            {
                name: 'kind',
                description: 'blocks or structures',
                choices: SCHEMA_KINDS,
                required: true,
                positional: 0
            },
            { name: 'name', description: 'Its name', required: true, positional: 1 }
        ],
        http: 'DELETE /operator/schemas/{kind}/{name}',
        destructive: true
    },
    {
        name: 'plans',
        summary: 'Every plan: limits, features, availability (billing)',
        http: 'GET /billing/operator/plans',
        readOnly: true
    },
    {
        name: 'update-plan',
        summary: 'Change a plan’s limits, features or availability (JSON)',
        args: [id('Plan')],
        body: 'json',
        http: 'PATCH /billing/operator/plans/{id}'
    },
    {
        name: 'billing',
        summary: 'Every project’s plan and extras',
        http: 'GET /billing/operator/projects',
        readOnly: true
    },
    {
        name: 'revenue',
        summary: 'Monthly recurring revenue, and what Stripe collected',
        http: 'GET /billing/operator/revenue',
        readOnly: true
    },
    {
        name: 'requests',
        summary: 'API request counts (Studio and public)',
        http: 'GET /studio/usage',
        readOnly: true
    },
    {
        name: 'seed',
        summary: 'Copy the blueprint seeds into the server’s blueprints',
        args: [
            {
                name: 'overwrite',
                type: 'boolean',
                description: 'Replace ones that exist',
                in: 'body',
                key: 'force'
            }
        ],
        http: 'POST /studio/seed'
    }
]);

export const billing = group('billing', [
    {
        name: 'show',
        summary: 'The project’s plan and subscription',
        args: [project],
        http: `GET /billing${P}`,
        readOnly: true
    },
    {
        name: 'plans',
        summary: 'Plans the project can be on, with prices',
        http: 'GET /billing/plans',
        readOnly: true
    },
    {
        name: 'checkout',
        summary: 'Move the project to a plan (gives the payment link)',
        args: [
            project,
            {
                name: 'plan',
                description: 'A plan id from `moteur billing plans` (personal, pro…)',
                required: true,
                positional: 0,
                in: 'body'
            },
            {
                name: 'interval',
                choices: ['month', 'year'],
                default: 'month',
                description: 'Billed monthly or yearly',
                in: 'body'
            },
            {
                name: 'studio-url',
                description: 'Where to come back to (default: MOTEUR_STUDIO_URL)',
                in: 'none',
                default: process.env.MOTEUR_STUDIO_URL || undefined
            }
        ],
        run: async ctx => {
            const projectId = await ctx.project();
            const studio = ctx.args['studio-url'] as string | undefined;
            if (!studio)
                throw new UsageError(
                    'Where should the payment page come back to? --studio-url or MOTEUR_STUDIO_URL'
                );
            const back = `${studio.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}/setup/billing`;
            return (await ctx.client()).post(
                `/billing/projects/${encodeURIComponent(projectId)}/checkout`,
                {
                    plan: ctx.args.plan,
                    interval: ctx.args.interval,
                    successUrl: `${back}?paid=1`,
                    cancelUrl: back
                }
            );
        },
        covers: [`POST /billing${P}/checkout`],
        done: r => {
            const url = (r as { url?: string }).url;
            return url ? `Pay here: ${url}` : 'Done.';
        }
    },
    {
        name: 'addons',
        summary: 'Set how many packs of an extra the project has',
        args: [
            project,
            {
                name: 'addon',
                description: 'An extra id from `moteur billing plans` (seats, storage…)',
                required: true,
                positional: 0,
                in: 'body'
            },
            {
                name: 'packs',
                type: 'number',
                description: 'How many packs',
                required: true,
                positional: 1,
                in: 'body',
                key: 'quantity'
            }
        ],
        http: `POST /billing${P}/addons`
    },
    {
        name: 'portal',
        summary: 'A link to the Stripe customer portal',
        args: [
            project,
            {
                name: 'studio-url',
                description: 'Where to come back to (default: MOTEUR_STUDIO_URL)',
                in: 'body',
                key: 'returnUrl',
                default: process.env.MOTEUR_STUDIO_URL || undefined
            }
        ],
        http: `POST /billing${P}/portal`,
        done: r => `Open: ${(r as { url?: string }).url ?? ''}`
    }
]);

export const radar = group('radar', [
    {
        name: 'report',
        summary: 'Problems found in the content (missing translations, broken links…)',
        args: [
            project,
            {
                name: 'scan',
                type: 'boolean',
                description: 'Scan again instead of the last report',
                in: 'query'
            },
            { name: 'severity', description: 'Only this severity', in: 'query' },
            { name: 'model', description: 'Only this model', in: 'query' },
            { name: 'locale', description: 'Only this language', in: 'query' },
            { name: 'rule', description: 'Only this rule', in: 'query', key: 'ruleId' }
        ],
        http: `GET ${P}/radar`,
        readOnly: true
    },
    {
        name: 'entry',
        summary: 'Problems in one entry',
        args: [
            project,
            { name: 'slug', description: 'model__entry', required: true, positional: 0 }
        ],
        http: `GET ${P}/radar/entry/{slug}`,
        readOnly: true
    }
]);

export const search = group('search', [
    {
        name: 'query',
        summary: 'Search entries in the project’s search engine',
        args: [
            project,
            { name: 'q', description: 'What to find', required: true, positional: 0, in: 'query' },
            {
                name: 'engine',
                choices: ['meilisearch', 'algolia'],
                default: 'meilisearch',
                description: 'Which engine',
                in: 'none'
            },
            { name: 'limit', type: 'number', description: 'How many', in: 'query' }
        ],
        http: `GET ${P}/search/{engine}`,
        covers: [`GET ${P}/search/meilisearch`, `GET ${P}/search/algolia`],
        readOnly: true
    },
    {
        name: 'reindex',
        summary: 'Send every entry to the search engine again (operators)',
        args: [
            project,
            {
                name: 'engine',
                choices: ['meilisearch', 'algolia'],
                default: 'meilisearch',
                description: 'Which engine',
                in: 'none'
            }
        ],
        http: `POST ${P}/search/{engine}/reindex`,
        covers: [`POST ${P}/search/meilisearch/reindex`, `POST ${P}/search/algolia/reindex`]
    }
]);

export const shopify = group('shopify', [
    {
        name: 'status',
        summary: 'The Shopify connection',
        args: [project],
        http: `GET ${P}/shopify`,
        readOnly: true
    },
    {
        name: 'connect',
        summary: 'Set the shop, its token and the product model',
        args: [
            project,
            { name: 'shop', description: 'my-shop.myshopify.com', in: 'body' },
            {
                name: 'token',
                description: 'Admin API access token',
                in: 'body',
                key: 'accessToken'
            },
            {
                name: 'model',
                description: 'Model products go into',
                in: 'body',
                key: 'productModelId'
            }
        ],
        http: `PATCH ${P}/shopify`
    },
    {
        name: 'sync',
        summary: 'Pull products from Shopify into entries',
        args: [project],
        http: `POST ${P}/shopify/sync`
    }
]);

export const play = group('play', [
    {
        name: 'poll',
        summary: 'A poll’s results',
        args: [project, id('Poll', 'poll')],
        http: `GET ${P}/play/polls/{poll}/results`,
        readOnly: true
    },
    {
        name: 'qr',
        summary: 'A QR code as SVG',
        args: [
            project,
            {
                name: 'text',
                description: 'What it encodes',
                required: true,
                positional: 0,
                in: 'query'
            },
            { name: 'size', type: 'number', description: 'Size in pixels', in: 'query' }
        ],
        run: async ctx =>
            (await ctx.client()).request({
                method: 'GET',
                url: fillPath(`${P}/play/qr.svg`, ctx.args, await ctx.project()),
                params: { text: ctx.args.text, size: ctx.args.size },
                responseType: 'text'
            }),
        covers: [`GET ${P}/play/qr.svg`],
        readOnly: true
    },
    {
        name: 'oembed',
        summary: 'The embed for a link (YouTube, Vimeo…)',
        args: [
            project,
            { name: 'url', description: 'The link', required: true, positional: 0, in: 'query' }
        ],
        http: `GET ${P}/play/oembed/resolve`,
        readOnly: true
    }
]);

export const status = group('status', [
    {
        name: '',
        summary: 'The default project, the API, and the models in it',
        offline: true,
        run: async ctx => {
            const config = await loadConfig();
            let projectId: string | undefined;
            try {
                projectId = await ctx.project();
            } catch {
                return { api: config.apiUrl ?? null, project: null };
            }
            const client = await ctx.client();
            const [{ project: p }, { models }] = await Promise.all([
                client.projects.get(projectId),
                client.models.list(projectId)
            ]);
            return {
                api: config.apiUrl,
                project: projectId,
                label: localized((p as { label?: unknown }).label),
                models: models.map(m => m.id)
            };
        },
        covers: ['GET /health'],
        done: r => {
            const s = r as { api?: string; project?: string; label?: string; models?: string[] };
            if (!s.project)
                return `API: ${s.api ?? '—'}\nNo default project: moteur projects use <id>`;
            return `Project: ${s.label} (${s.project})\nAPI: ${s.api}\nModels: ${(s.models ?? []).join(', ') || '—'}`;
        }
    }
]);

/** `moteur api GET /projects/demo/models`: any call, signed in. */
export const api = group('api', [
    {
        name: '',
        summary: 'Call any API route, signed in (for what has no command yet, and plugins)',
        args: [
            {
                name: 'method',
                description: 'GET, POST, PATCH, PUT or DELETE',
                required: true,
                positional: 0,
                choices: [
                    'GET',
                    'POST',
                    'PATCH',
                    'PUT',
                    'DELETE',
                    'get',
                    'post',
                    'patch',
                    'put',
                    'delete'
                ]
            },
            {
                name: 'path',
                description: 'The path; {project} becomes the current project',
                required: true,
                positional: 1
            },
            {
                name: 'query',
                type: 'list',
                description: 'key=value for the query string (repeat)',
                in: 'none'
            },
            {
                name: 'set',
                type: 'list',
                description: 'key=value for the JSON body (repeat)',
                in: 'none'
            },
            project
        ],
        body: 'json',
        run: async ctx => {
            const method = String(ctx.args.method).toUpperCase();
            const raw = String(ctx.args.path);
            const path = raw.includes('{project}')
                ? raw.replace('{project}', encodeURIComponent(await ctx.project()))
                : raw;
            const params = Object.fromEntries(
                ((ctx.args.query as string[] | undefined) ?? []).map(p => [
                    p.slice(0, p.indexOf('=')),
                    p.slice(p.indexOf('=') + 1)
                ])
            );
            const data =
                method === 'GET' || method === 'DELETE'
                    ? undefined
                    : { ...(await ctx.body()), ...setPairs(ctx.args.set) };
            return (await ctx.client()).request({ method, url: path, params, data });
        },
        examples: [
            'moteur api GET /projects/{project}/usage',
            'moteur api POST /projects/{project}/notifications/read-all'
        ]
    }
] as Omit<CommandSpec, 'group'>[]);

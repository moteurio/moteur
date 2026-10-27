/** Projects, and who and what can reach them: people, invites, keys, channels, webhooks, branches. */
import fs from 'fs';
import path from 'path';
import { group, id, project, type ArgSpec } from '../spec.js';
import { crud } from '../kit.js';
import { localized } from '../format.js';
import { loadConfig, saveConfig } from '../config.js';
import { describeProject } from '../describe.js';

const P = '/projects/{project}';
const projectFirst: ArgSpec = { ...project, positional: 0 };

export const projects = group('projects', [
    {
        name: 'list',
        summary: 'Your projects',
        http: 'GET /projects',
        pick: 'projects',
        table: [
            { key: 'id', header: 'id' },
            { key: 'label', header: 'label', format: localized },
            { key: 'defaultLocale', header: 'language' },
            {
                key: 'supportedLocales',
                header: 'others',
                format: v => ((v as string[]) ?? []).join(', ')
            }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'Show a project and its settings',
        args: [projectFirst],
        http: `GET ${P}`,
        readOnly: true
    },
    {
        name: 'describe',
        summary:
            'A project’s shape in one answer: languages, how content goes live, your roles, every model’s fields',
        description:
            'Start here before reading or writing content: each field in a line (type, per language, required, choices).',
        args: [projectFirst],
        readOnly: true,
        run: async ctx => {
            const id = await ctx.project();
            const c = await ctx.client();
            const enc = encodeURIComponent(id);
            const [p, m, me] = await Promise.all([
                c.get<{ project?: unknown }>(`/projects/${enc}`),
                c.get<{ models?: unknown } | unknown[]>(`/projects/${enc}/models`),
                c.get<{ user: { id: string; name?: string; roles?: string[] } }>('/auth/me')
            ]);
            const project = ((p as { project?: unknown }).project ?? p) as Parameters<
                typeof describeProject
            >[0];
            const models = (
                Array.isArray(m) ? m : ((m as { models?: unknown[] }).models ?? [])
            ) as Parameters<typeof describeProject>[1];
            return describeProject(project, models, me.user);
        }
    },
    {
        name: 'create',
        summary: 'Create a project (JSON, or an id and a label)',
        args: [
            { name: 'id', description: 'Its id (letters, digits, -)', in: 'body', positional: 0 },
            { name: 'label', description: 'Its name', in: 'body' },
            {
                name: 'language',
                description: 'Default language (fr, en…)',
                in: 'body',
                key: 'defaultLocale'
            },
            {
                name: 'languages',
                type: 'list',
                description: 'Other languages',
                in: 'body',
                key: 'supportedLocales'
            },
            {
                name: 'blueprint',
                description: 'Start from this project blueprint',
                in: 'body',
                key: 'blueprintId'
            }
        ],
        body: 'json',
        http: 'POST /projects',
        done: (r, a) =>
            `Created ${(r as { project?: { id?: string } })?.project?.id ?? a.id}. Make it the default: moteur projects use ${a.id ?? '<id>'}`
    },
    {
        name: 'update',
        summary: 'Change a project’s settings (JSON with the fields to change, or a new label)',
        args: [projectFirst, { name: 'label', description: 'New name', in: 'body' }],
        body: 'json',
        http: `PATCH ${P}`,
        done: () => 'Saved.'
    },
    {
        name: 'delete',
        summary: 'Delete a project',
        args: [projectFirst],
        http: `DELETE ${P}`,
        destructive: true,
        done: () => 'Deleted.'
    },
    {
        name: 'use',
        summary: 'Make a project the default for every command',
        args: [{ name: 'id', description: 'Project id', required: true, positional: 0 }],
        offline: true,
        run: async ctx => {
            const config = await loadConfig();
            await saveConfig({ ...config, projectId: String(ctx.args.id) });
            return { projectId: ctx.args.id };
        },
        done: (_r, a) => `Default project: ${a.id}.`
    },
    {
        name: 'usage',
        summary: 'This month’s use: entries, storage, requests, AI',
        args: [projectFirst],
        http: `GET ${P}/usage`,
        readOnly: true
    },
    {
        name: 'limits',
        summary: 'What the project’s plan allows',
        args: [projectFirst],
        http: `GET ${P}/limits`,
        readOnly: true
    }
]);

const userArg: ArgSpec = { ...id('Person', 'user'), aliases: ['id', 'userId'] };

export const members = group('members', [
    {
        name: 'list',
        summary: 'People in the project, their roles, when they were last here',
        args: [project],
        http: `GET ${P}/users`,
        pick: 'users',
        table: [
            { key: 'id', header: 'id' },
            { key: 'name', header: 'name' },
            { key: 'email', header: 'email' },
            { key: 'roles', header: 'roles', format: v => ((v as string[]) ?? []).join(', ') },
            { key: 'online', header: 'online' },
            { key: 'lastLoginAt', header: 'last here' }
        ],
        readOnly: true
    },
    {
        name: 'update',
        summary: 'Change someone’s roles in the project, or turn their access off',
        args: [
            project,
            userArg,
            {
                name: 'roles',
                type: 'list',
                description: 'writer, translator, reviewer, admin, developer, billing',
                in: 'body'
            },
            {
                name: 'active',
                type: 'boolean',
                description: 'Access on (--no-active: off)',
                in: 'body',
                key: 'isActive'
            },
            { name: 'name', description: 'Name', in: 'body' }
        ],
        http: `PATCH ${P}/users/{user}`,
        done: (_r, a) => `Saved ${a.user}.`
    }
]);

const inviteArg: ArgSpec = { ...id('Invite'), aliases: ['inviteId'] };
const tokenArg: ArgSpec = {
    name: 'token',
    description: 'The token from the invite link',
    required: true,
    positional: 0
};
const appUrl: ArgSpec = {
    name: 'studio-url',
    description: 'The Studio the link opens (default: MOTEUR_STUDIO_URL)',
    in: 'body',
    key: 'appUrl',
    default: process.env.MOTEUR_STUDIO_URL || undefined
};

export const invites = group('invites', [
    {
        name: 'list',
        summary: 'Invites not answered yet',
        args: [project],
        http: `GET ${P}/invites`,
        pick: 'invites',
        table: [
            { key: 'id', header: 'id' },
            { key: 'email', header: 'email' },
            { key: 'roles', header: 'roles', format: v => ((v as string[]) ?? []).join(', ') },
            { key: 'expiresAt', header: 'expires' }
        ],
        readOnly: true
    },
    {
        name: 'send',
        summary: 'Invite someone to the project',
        args: [
            project,
            {
                name: 'email',
                description: 'Their email',
                required: true,
                positional: 0,
                in: 'body'
            },
            {
                name: 'roles',
                type: 'list',
                description: 'Their roles (default writer)',
                in: 'body'
            },
            appUrl
        ],
        http: `POST ${P}/invites`,
        done: (_r, a) => `Invited ${a.email}.`
    },
    {
        name: 'resend',
        summary: 'Send an invite again',
        args: [project, inviteArg, appUrl],
        http: `POST ${P}/invites/{id}/resend`,
        done: () => 'Sent again.'
    },
    {
        name: 'withdraw',
        summary: 'Withdraw an invite',
        args: [project, inviteArg],
        http: `DELETE ${P}/invites/{id}`,
        destructive: true,
        done: () => 'Withdrawn.'
    },
    {
        name: 'show',
        summary: 'What an invite link is for',
        args: [tokenArg],
        http: 'GET /invites/{token}',
        readOnly: true,
        offline: true
    },
    {
        name: 'accept',
        summary: 'Join a project with an invite (signed in)',
        args: [tokenArg],
        http: 'POST /invites/{token}/accept',
        done: () => 'Joined.'
    },
    {
        name: 'register',
        summary: 'Create your account from an invite',
        args: [
            tokenArg,
            { name: 'name', description: 'Your name', required: true, in: 'body' },
            {
                name: 'password',
                description: 'Your password (8+ characters)',
                required: true,
                in: 'body'
            }
        ],
        http: 'POST /invites/{token}/register',
        offline: true,
        done: () => 'Account created. Sign in: moteur auth login'
    }
]);

const keyArg: ArgSpec = { ...id('Key'), aliases: ['keyId'] };
const keyFields: ArgSpec[] = [
    { name: 'label', description: 'A name for it', in: 'body' },
    {
        name: 'expires-at',
        description: 'When it stops working (ISO date)',
        in: 'body',
        key: 'expiresAt'
    },
    {
        name: 'channels',
        type: 'list',
        description: 'Channels it may read',
        in: 'body',
        key: 'allowedCollectionIds'
    },
    {
        name: 'site-wide',
        type: 'boolean',
        description: 'May read site-wide data (pages, menus…)',
        in: 'body',
        key: 'allowSiteWideReads'
    }
];

export const keys = group('keys', [
    {
        name: 'list',
        summary: 'API keys (never their secrets)',
        args: [project],
        http: `GET ${P}/api-keys`,
        pick: 'keys',
        table: [
            { key: 'id', header: 'id' },
            { key: 'label', header: 'label' },
            { key: 'prefix', header: 'starts with' },
            { key: 'expiresAt', header: 'expires' },
            { key: 'lastUsedAt', header: 'last used' }
        ],
        readOnly: true
    },
    {
        name: 'create',
        summary: 'Make an API key (its secret is shown once)',
        args: [project, ...keyFields],
        http: `POST ${P}/api-keys`
    },
    {
        name: 'update',
        summary: 'Change a key’s name, expiry or what it may read',
        args: [
            project,
            keyArg,
            ...keyFields,
            {
                name: 'hosts',
                type: 'list',
                description: 'Sites allowed to use it',
                in: 'body',
                key: 'allowedHosts'
            }
        ],
        http: `PATCH ${P}/api-keys/{id}`,
        done: () => 'Saved.'
    },
    {
        name: 'rotate',
        summary: 'Replace a key’s secret (the old one stops working)',
        args: [project, keyArg],
        http: `POST ${P}/api-keys/{id}/rotate`,
        destructive: true
    },
    {
        name: 'revoke',
        summary: 'Turn a key off for good',
        args: [project, keyArg],
        http: `DELETE ${P}/api-keys/{id}`,
        destructive: true,
        done: () => 'Revoked.'
    }
]);

export const channels = group('channels', [
    ...crud({
        noun: 'channel',
        base: `${P}/collections`,
        pick: 'collections',
        table: [
            { key: 'id', header: 'id' },
            { key: 'label', header: 'label', format: localized },
            {
                key: 'resources',
                header: 'resources',
                format: v => String((v as unknown[] | undefined)?.length ?? 0)
            }
        ]
    }),
    {
        name: 'openapi',
        summary: 'The OpenAPI document a frontend reads this channel with',
        args: [project, { ...id('Channel'), positional: 0 }],
        http: `GET ${P}/collections/{id}/openapi`,
        readOnly: true
    }
]);

const hookArg: ArgSpec = { ...id('Webhook'), aliases: ['webhookId'] };

export const webhooks = group('webhooks', [
    ...crud({
        noun: 'webhook',
        base: `${P}/webhooks`,
        pick: 'webhooks',
        table: [
            { key: 'id', header: 'id' },
            { key: 'url', header: 'address' },
            { key: 'events', header: 'events', format: v => ((v as string[]) ?? []).join(', ') },
            { key: 'enabled', header: 'on' }
        ]
    }),
    {
        name: 'test',
        summary: 'Send a test call',
        args: [project, hookArg],
        http: `POST ${P}/webhooks/{id}/test`
    },
    {
        name: 'log',
        summary: 'Recent deliveries and their answers',
        args: [
            project,
            hookArg,
            { name: 'limit', type: 'number', description: 'How many', in: 'query' },
            { name: 'offset', type: 'number', description: 'How many to skip', in: 'query' }
        ],
        http: `GET ${P}/webhooks/{id}/log`,
        pick: 'deliveries',
        table: [
            { key: 'id', header: 'id' },
            { key: 'event', header: 'event' },
            { key: 'status', header: 'status' },
            { key: 'responseStatus', header: 'answer' },
            { key: 'createdAt', header: 'when' }
        ],
        readOnly: true
    },
    {
        name: 'retry',
        summary: 'Send a failed delivery again',
        args: [
            project,
            hookArg,
            {
                name: 'delivery',
                description: 'Delivery id (from log)',
                required: true,
                positional: 1
            }
        ],
        http: `POST ${P}/webhooks/{id}/log/{delivery}/retry`
    },
    {
        name: 'rotate-secret',
        summary: 'Replace the signing secret',
        args: [project, hookArg],
        http: `POST ${P}/webhooks/{id}/rotate-secret`,
        destructive: true
    }
]);

export const branches = group('branches', [
    {
        name: 'list',
        summary: 'Content branches, and the current one',
        args: [project],
        http: `GET ${P}/branches`,
        readOnly: true
    },
    {
        name: 'create',
        summary: 'Start a branch',
        args: [
            project,
            { name: 'name', description: 'Branch name', required: true, positional: 0, in: 'body' },
            { name: 'from', description: 'Start from (default: current)', in: 'body' }
        ],
        http: `POST ${P}/branches`,
        done: (_r, a) => `Created ${a.name}.`
    },
    {
        name: 'switch',
        summary: 'Work on another branch',
        args: [
            project,
            {
                name: 'branch',
                description: 'Branch name',
                required: true,
                positional: 0,
                in: 'body'
            }
        ],
        http: `POST ${P}/branches/switch`,
        done: (_r, a) => `On ${a.branch}.`
    },
    {
        name: 'merge',
        summary: 'Bring a branch into the current one',
        args: [
            project,
            {
                name: 'source',
                description: 'Branch to merge',
                required: true,
                positional: 0,
                in: 'body',
                key: 'sourceBranch'
            }
        ],
        http: `POST ${P}/branches/merge`,
        destructive: true,
        done: (_r, a) => `Merged ${a.source}.`
    },
    {
        name: 'log',
        summary: 'The content’s git history',
        args: [
            project,
            { name: 'path', description: 'Only this file or folder', in: 'query' },
            { name: 'max', type: 'number', description: 'How many', in: 'query' }
        ],
        http: `GET ${P}/git/log`,
        readOnly: true
    },
    {
        name: 'status',
        summary: 'Where the history stands: branch, last commit, and what the Git address lacks',
        args: [project],
        http: `GET ${P}/git/status`,
        readOnly: true
    },
    {
        name: 'push',
        summary: 'Push the history to the project’s Git address now',
        args: [project],
        http: `POST ${P}/git/push`,
        done: r =>
            (r as { pushed?: boolean })?.pushed
                ? 'Pushed.'
                : 'The push failed: check that the server can write to the Git address.'
    }
]);

/** Each declaration of a generated types file, by name. */
function declarations(text: string): Map<string, string> {
    const out = new Map<string, string>();
    const parts = text.split(/^(?=export )/m);
    for (const part of parts) {
        const name = /^export (?:type|interface) (\w+)/.exec(part)?.[1];
        if (name) out.set(name, part.trim());
    }
    return out;
}

/** What changed between the types on file and the project's: `+ Added`, `- Removed`, `~ Changed`. */
export function typesDiff(onFile: string, current: string): string[] {
    const before = declarations(onFile);
    const after = declarations(current);
    const lines: string[] = [];
    for (const [name, text] of after) {
        if (!before.has(name)) lines.push(`+ ${name}`);
        else if (before.get(name) !== text) lines.push(`~ ${name}`);
    }
    for (const name of before.keys()) if (!after.has(name)) lines.push(`- ${name}`);
    return lines;
}

/** The content as TypeScript types: `moteur types --out src/moteur.ts`. */
export const types = group('types', [
    {
        name: '',
        summary: 'TypeScript types of the content (models, templates, blocks, structures)',
        description:
            "Each type takes a locale mode: 'all' as stored, or 'one' for content read with ?locale=. Make them again after changing a schema; in CI, --check fails when the file is out of date.",
        args: [
            project,
            {
                name: 'out',
                description: 'Write them to this file instead of printing them',
                in: 'none',
                local: true
            },
            {
                name: 'check',
                type: 'boolean',
                description: 'Change nothing; fail if the file differs from the project',
                in: 'none'
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const text = await client.request<string>({
                method: 'GET',
                url: `/projects/${encodeURIComponent(await ctx.project())}/types`,
                responseType: 'text'
            });
            const out = ctx.args.out ? String(ctx.args.out) : undefined;
            if (ctx.args.check && !out) throw new Error('--check needs --out: the file to check.');
            if (!out) return text;
            if (!ctx.local) throw new Error('Files can’t be written here: leave out out.');
            if (ctx.args.check) {
                const onFile = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
                if (onFile === text) return `${out} is up to date.`;
                const changed = onFile ? typesDiff(onFile, text) : [];
                throw new Error(
                    (onFile ? `${out} is out of date` : `${out} doesn’t exist`) +
                        (changed.length ? `:\n  ${changed.join('\n  ')}` : '.') +
                        `\nMake it again: moteur types --out ${out}`
                );
            }
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, text);
            return `Wrote ${out}.`;
        },
        covers: [`GET ${P}/types`],
        readOnly: true,
        examples: ['moteur types --out src/moteur.ts', 'moteur types --out src/moteur.ts --check']
    }
]);

const importArg: ArgSpec = { ...id('Import'), positional: 0 };

/** What an import did, in a line. */
function importLine(r: unknown): string {
    const job = r as {
        id: string;
        status: string;
        dryRun?: boolean;
        items?: { action: string }[];
        issues?: { path: string; message: string }[];
        progress?: { done: number; total: number };
    };
    const changed = (job.items ?? []).filter(i => i.action !== 'skip').length;
    const issues = (job.issues ?? [])
        .map(i => `\n  ${i.path || '(bundle)'}: ${i.message}`)
        .join('');
    switch (job.status) {
        case 'running':
            return `Still importing (${job.progress?.done ?? 0} of ${job.progress?.total ?? '?'}). Follow it: moteur imports get ${job.id}`;
        case 'failed':
            return `Nothing was kept:${issues}`;
        case 'awaiting_approval':
            return `Saved ${changed} as drafts. A person puts them live: moteur imports approve ${job.id}`;
        default:
            return job.dryRun
                ? `Checked: ${changed} would be saved, nothing was kept.`
                : `Imported ${changed}.${issues ? ` Some could not go live:${issues}` : ''}`;
    }
}

/** Bundles: many things saved at once, all or nothing (`moteur imports run site.json`). */
export const imports = group('imports', [
    {
        name: 'run',
        summary:
            'Import a bundle: schemas, files, pages, entries, menus, redirects (all or nothing)',
        description:
            'The bundle comes from a file, or as the JSON body. { "$ref": "page:<ref>" } (or entry:<model>/<ref>, asset:<ref>) anywhere stands for the id of something in the bundle. Try it first with --dry-run.',
        args: [
            project,
            {
                name: 'file',
                description: 'The bundle (JSON) on this machine',
                positional: 0,
                in: 'none',
                local: true
            },
            {
                name: 'dry-run',
                type: 'boolean',
                description: 'Check everything as if saving, then keep nothing',
                in: 'none'
            },
            {
                name: 'wait',
                type: 'number',
                description: 'Seconds to wait for the end before answering (0–60)',
                in: 'none'
            }
        ],
        body: 'json',
        run: async ctx => {
            const client = await ctx.client();
            let bundle: Record<string, unknown>;
            if (ctx.args.file) {
                if (!ctx.local) throw new Error('Files on disk can’t be read here: give the body.');
                bundle = JSON.parse(fs.readFileSync(String(ctx.args.file), 'utf8'));
            } else bundle = await ctx.body();
            if (!Object.keys(bundle).length)
                throw new Error('Give the bundle: a file, or the body.');
            return client.imports.run(await ctx.project(), bundle as never, {
                dryRun: ctx.args['dry-run'] === true,
                ...(ctx.args.wait !== undefined && { wait: Number(ctx.args.wait) })
            });
        },
        covers: [`POST ${P}/imports`],
        done: importLine,
        examples: ['moteur imports run site.json --dry-run', 'moteur imports run site.json']
    },
    {
        name: 'list',
        summary: 'Recent imports',
        args: [project],
        http: `GET ${P}/imports`,
        table: [
            { key: 'id', header: 'id' },
            { key: 'status', header: 'status' },
            { key: 'createdAt', header: 'started' },
            { key: 'items', header: 'saved', format: v => String((v as unknown[]).length) }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'An import and how far it has come',
        args: [project, importArg],
        http: `GET ${P}/imports/{id}`,
        done: importLine,
        readOnly: true
    },
    {
        name: 'approve',
        summary: 'Put a waiting import live (a person who can publish)',
        args: [project, importArg],
        http: `POST ${P}/imports/{id}/approve`,
        done: importLine
    }
]);

/** The project as a bundle (`moteur export --out site.json`), to import elsewhere. */
export const exportBundle = group('export', [
    {
        name: '',
        summary: 'The project as an import bundle',
        args: [
            project,
            {
                name: 'out',
                description: 'Write it to this file instead of printing it',
                in: 'none',
                local: true
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const bundle = await client.imports.export(await ctx.project());
            if (!ctx.args.out) return bundle;
            if (!ctx.local) throw new Error('Files can’t be written here: leave out out.');
            fs.writeFileSync(String(ctx.args.out), JSON.stringify(bundle, null, 2));
            return `Wrote ${ctx.args.out}.`;
        },
        covers: [`GET ${P}/export`],
        readOnly: true,
        examples: ['moteur export --out site.json']
    }
]);

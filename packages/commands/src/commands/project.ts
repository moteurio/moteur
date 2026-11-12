/** Commands for projects and for what can access them: members, invites, API keys, channels, webhooks and branches. */
import fs from 'fs';
import path from 'path';
import { group, id, project, type ArgSpec } from '../spec.js';
import { crud } from '../kit.js';
import { localized } from '../format.js';
import { loadConfig, onProjectKey, saveConfig } from '../config.js';
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
                c.get<{ user: Parameters<typeof describeProject>[2] }>('/auth/me')
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
        name: 'add-blueprint',
        summary: 'Add a blueprint’s content to an empty project (one made without it)',
        args: [
            project,
            {
                name: 'blueprint',
                description: 'A project blueprint (moteur blueprints list project)',
                required: true,
                positional: 0,
                in: 'body',
                key: 'blueprintId'
            }
        ],
        http: `POST ${P}/blueprint`,
        done: r => {
            const b = (r as { fromBlueprint?: { id?: string; status?: string } }).fromBlueprint;
            return b?.status === 'done'
                ? `The ${b.id} blueprint’s content is in.`
                : `The import ${b?.status ?? 'stopped'}.`;
        }
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
        name: 'move',
        summary: 'Move a project to another workspace (a handover)',
        description:
            'Owners and admins of its workspace, to a workspace where they may start projects. People added to it one by one stay; the old team leaves, the new one comes in.',
        args: [
            projectFirst,
            {
                name: 'workspace',
                description: 'The workspace it goes to (ws_…)',
                required: true,
                in: 'body',
                key: 'workspaceId'
            }
        ],
        http: `POST ${P}/move`,
        done: (_r, a) => `Moved to ${a.workspace}.`
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

const W = '/workspaces/{workspace}';
const wsArg: ArgSpec = {
    name: 'workspace',
    description: 'Workspace id (ws_…)',
    required: true,
    positional: 0,
    aliases: ['workspaceId']
};
const wsUser: ArgSpec = {
    name: 'user',
    description: 'Person id',
    required: true,
    aliases: ['userId']
};
const wsInvite: ArgSpec = {
    name: 'invite',
    description: 'Invite id',
    required: true,
    aliases: ['inviteId']
};
const placeArgs: ArgSpec[] = [
    {
        name: 'role',
        description: 'owner, admin, billing or member',
        choices: ['owner', 'admin', 'billing', 'member'],
        required: true,
        in: 'body'
    },
    {
        name: 'access',
        description: 'Members: every project (all) or those they are added to (chosen, default)',
        choices: ['all', 'chosen'],
        in: 'body'
    },
    {
        name: 'project-roles',
        type: 'list',
        description: 'Members with all: their roles in every project (default writer)',
        in: 'body',
        key: 'projectRoles'
    }
];

export const workspaces = group('workspaces', [
    {
        name: 'list',
        summary: 'Your workspaces, and your role in each',
        http: 'GET /workspaces',
        pick: 'workspaces',
        table: [
            { key: 'id', header: 'id' },
            { key: 'name', header: 'name' },
            { key: 'role', header: 'role' },
            { key: 'members', header: 'people' },
            { key: 'projects', header: 'projects' }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'A workspace and its people',
        args: [wsArg],
        http: `GET ${W}`,
        readOnly: true
    },
    {
        name: 'create',
        summary: 'Start a workspace (you are its owner)',
        args: [
            { name: 'name', description: 'Its name', required: true, positional: 0, in: 'body' }
        ],
        http: 'POST /workspaces',
        done: r =>
            `Started ${(r as { workspace?: { id?: string } }).workspace?.id}. New projects go in it with: moteur projects create --data '{"workspaceId":"…"}'`
    },
    {
        name: 'rename',
        summary: 'Rename a workspace',
        args: [wsArg, { name: 'name', description: 'Its new name', required: true, in: 'body' }],
        http: `PATCH ${W}`,
        done: () => 'Renamed.'
    },
    {
        name: 'delete',
        summary: 'Delete an empty workspace (owners)',
        args: [wsArg],
        http: `DELETE ${W}`,
        destructive: true,
        done: () => 'Deleted.'
    },
    {
        name: 'set-member',
        summary: 'Change someone’s place in a workspace',
        args: [wsArg, wsUser, ...placeArgs],
        http: `PATCH ${W}/members/{user}`,
        done: (_r, a) => `Saved ${a.user}.`
    },
    {
        name: 'remove-member',
        summary: 'Take someone out of a workspace and all its projects (or leave it: your own id)',
        args: [wsArg, wsUser],
        http: `DELETE ${W}/members/{user}`,
        destructive: true,
        done: () => 'Removed.'
    },
    {
        name: 'invites',
        summary: 'Workspace invites not answered yet',
        args: [wsArg],
        http: `GET ${W}/invites`,
        pick: 'invites',
        table: [
            { key: 'id', header: 'id' },
            { key: 'email', header: 'email' },
            { key: 'role', header: 'role' },
            { key: 'expiresAt', header: 'expires' }
        ],
        readOnly: true
    },
    {
        name: 'invite',
        summary: 'Invite someone into a workspace',
        args: [
            wsArg,
            { name: 'email', description: 'Their email', required: true, in: 'body' },
            ...placeArgs,
            {
                name: 'studio-url',
                description: 'The Studio the link opens (default: MOTEUR_STUDIO_URL)',
                in: 'body',
                key: 'appUrl',
                default: process.env.MOTEUR_STUDIO_URL || undefined
            }
        ],
        http: `POST ${W}/invites`,
        done: (_r, a) => `Invited ${a.email}.`
    },
    {
        name: 'resend-invite',
        summary: 'Send a workspace invite again',
        args: [wsArg, wsInvite],
        http: `POST ${W}/invites/{invite}/resend`,
        done: () => 'Sent again.'
    },
    {
        name: 'withdraw-invite',
        summary: 'Withdraw a workspace invite',
        args: [wsArg, wsInvite],
        http: `DELETE ${W}/invites/{invite}`,
        destructive: true,
        done: () => 'Withdrawn.'
    }
]);

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
        summary: 'Change someone’s roles in the project',
        args: [
            project,
            userArg,
            {
                name: 'roles',
                type: 'list',
                description:
                    'writer, translator, reviewer, lead, builder, admin, developer, billing',
                in: 'body'
            }
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
        summary: 'Join a project or a workspace with an invite (signed in)',
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
                description: 'Your password (8+ characters); leave it out to sign in by email code',
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
        key: 'allowedChannelIds'
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
        base: `${P}/channels`,
        pick: 'channels',
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
        http: `GET ${P}/channels/{id}/openapi`,
        readOnly: true
    },
    {
        name: 'schema',
        summary: 'What this channel delivers, described: models, templates, blocks, structures',
        description:
            "Each field's type, label, description and the options that explain its value. A read-only key for the channel can read it.",
        args: [project, { ...id('Channel'), positional: 0 }],
        http: `GET ${P}/channels/{id}/schema`,
        readOnly: true,
        examples: ['moteur channels schema site --json']
    }
]);

const hookArg: ArgSpec = { ...id('Webhook'), aliases: ['webhookId'] };

export const webhooks = group('webhooks', [
    ...crud({
        noun: 'webhook',
        base: `${P}/webhooks`,
        pick: 'webhooks',
        skip: ['create'],
        table: [
            { key: 'id', header: 'id' },
            { key: 'url', header: 'address' },
            { key: 'events', header: 'events', format: v => ((v as string[]) ?? []).join(', ') },
            { key: 'enabled', header: 'on' }
        ]
    }),
    {
        name: 'create',
        summary: 'Call an address when content changes: a build hook, or any service',
        description:
            "A deploy hook (`--kind deploy`) is a host's build hook (Vercel, Netlify, Cloudflare Pages…): it waits for more changes, then calls once, when what's live changes. Without --events, a deploy hook listens to what goes live; any other hook to every event.",
        args: [
            project,
            { name: 'url', description: 'The address to call (https)', in: 'body' },
            {
                name: 'kind',
                description: 'deploy: a build hook, called once per round of changes',
                choices: ['webhook', 'deploy'],
                in: 'body'
            },
            {
                name: 'events',
                type: 'list',
                description: 'Only these events: page.published,entry.published…',
                in: 'body'
            },
            { name: 'name', description: 'What it is for (default: its address)', in: 'body' },
            {
                name: 'wait',
                type: 'number',
                description: 'A deploy hook: seconds to wait for more changes (default 30)',
                in: 'body',
                key: 'batchSeconds'
            }
        ],
        body: 'json',
        http: `POST ${P}/webhooks`,
        examples: [
            'moteur webhooks create --kind deploy --url "$DEPLOY_HOOK"',
            'moteur webhooks create --url https://example.com/hook --events form.submitted'
        ],
        done: r => {
            const w = r as { id: string; kind?: string; secret?: string };
            return w.kind === 'deploy'
                ? `Made ${w.id}: the site rebuilds when what's live changes.`
                : `Made ${w.id}. Its signing secret, shown once: ${w.secret}`;
        }
    },
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

/** Splits a generated types file into its exported declarations, keyed by name. */
function declarations(text: string): Map<string, string> {
    const out = new Map<string, string>();
    const parts = text.split(/^(?=export )/m);
    for (const part of parts) {
        const name = /^export (?:type|interface) (\w+)/.exec(part)?.[1];
        if (name) out.set(name, part.trim());
    }
    return out;
}

/** Compares the types on file with the project's current types. Each line is prefixed with `+` for added, `-` for removed or `~` for changed. */
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

/** Generates TypeScript types for the project's content, as in `moteur types --out src/moteur.ts`. */
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
                name: 'channel',
                description:
                    "Only what this channel delivers, from its schema (the site's read-only key is enough)",
                in: 'none'
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
            // With a project key, use the key's channel unless --channel names another.
            let channel = ctx.args.channel ? String(ctx.args.channel) : undefined;
            if (!channel && (await onProjectKey())) {
                const key = await client.get<{ channel?: string; channels: string[] }>('/keys/me');
                channel = key.channel;
                if (!channel)
                    throw new Error(
                        `This key reads several channels (${key.channels.join(', ')}): name one with --channel.`
                    );
            }
            const project = encodeURIComponent(await ctx.project());
            const text = await client.request<string>({
                method: 'GET',
                url: channel
                    ? `/projects/${project}/channels/${encodeURIComponent(channel)}/types`
                    : `/projects/${project}/types`,
                responseType: 'text'
            });
            const out = ctx.args.out ? String(ctx.args.out) : undefined;
            if (ctx.args.check && !out) throw new Error('--check needs --out: the file to check.');
            if (!out) return text;
            if (!ctx.local) throw new Error('Files can’t be written here: leave out out.');
            // Put the actual --out path in the file's header, so the header shows the command that regenerates it.
            const again = `--out ${/\s/.test(out) ? JSON.stringify(out) : out}`;
            const written = text.replace('--out <file>', again);
            if (ctx.args.check) {
                // Ignore line-ending differences, because git may convert LF to CRLF on checkout.
                const lf = (s: string) => s.replace(/\r\n/g, '\n');
                const onFile = fs.existsSync(out) ? lf(fs.readFileSync(out, 'utf8')) : '';
                if (onFile === lf(written)) return `${out} is up to date.`;
                const changed = onFile ? typesDiff(onFile, lf(written)) : [];
                throw new Error(
                    (onFile ? `${out} is out of date` : `${out} doesn’t exist`) +
                        (changed.length ? `:\n  ${changed.join('\n  ')}` : '.') +
                        `\nMake it again: moteur types${channel ? ` --channel ${channel}` : ''} ${again}`
                );
            }
            fs.mkdirSync(path.dirname(out), { recursive: true });
            fs.writeFileSync(out, written);
            return `Wrote ${out}.`;
        },
        covers: [`GET ${P}/types`, `GET ${P}/channels/{channelId}/types`],
        readOnly: true,
        examples: [
            'moteur types --out src/moteur.ts',
            'MOTEUR_API_KEY=… moteur types --out src/moteur.ts --check'
        ]
    }
]);

const importArg: ArgSpec = { ...id('Import'), positional: 0 };

/** Summarizes the result of an import in one line. */
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

/** Bundle imports, which save many items at once, all or nothing, as in `moteur imports run site.json`. */
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

/** Exports the project as a bundle that can be imported elsewhere, as in `moteur export --out site.json`. */
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
            },
            {
                name: 'inline-files',
                type: 'boolean',
                description:
                    'Carry each file in the bundle, not its address (to move to another server)',
                in: 'query',
                key: 'inlineFiles'
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const bundle = await client.imports.export(await ctx.project(), {
                inlineFiles: ctx.args['inline-files'] === true
            });
            if (!ctx.args.out) return bundle;
            if (!ctx.local) throw new Error('Files can’t be written here: leave out out.');
            fs.writeFileSync(String(ctx.args.out), JSON.stringify(bundle, null, 2));
            return `Wrote ${ctx.args.out}.`;
        },
        covers: [`GET ${P}/export`],
        readOnly: true,
        examples: ['moteur export --out site.json', 'moteur export --inline-files --out site.json']
    }
]);

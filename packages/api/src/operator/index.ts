import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { capabilitiesFromContributions, mergeContributions } from '@moteurio/types/Plugin.js';
import {
    getProjectIdsForUser,
    loadProjects,
    updateProject,
    listTrashedProjects,
    purgeProject,
    purgeTrashedProject
} from '@moteurio/core/projects.js';
import { getUserById, listUsers, reloadUsers, updateUserAsOperator } from '@moteurio/core/users.js';
import { creditBalance, currentPeriod, getMeteringStore } from '@moteurio/core/metering.js';
import { pluginRegistry } from '@moteurio/core/registry/PluginRegistry.js';
import {
    deleteServerSchema,
    listServerSchemas,
    saveServerSchema,
    type ServerSchemaKind
} from '@moteurio/core/serverSchemas.js';
import {
    addOperator,
    listOperators,
    removeOperator,
    resetOperator,
    markOperatorNewsSeen,
    setOperatorNews,
    OPERATOR_NEWS_MODES,
    OperatorAuthError,
    type OperatorNewsMode
} from '@moteurio/core/operators.js';
import { listServerNews } from '@moteurio/core/serverNews.js';
import { requireOperator } from '../middlewares/auth.js';
import { listWorkspaces, workspacesOf } from '@moteurio/core/workspaces.js';
import { sendApiError } from '../utils/apiError.js';
import {
    pluginEntries,
    readPluginChoices,
    runsNextStart,
    savePluginChoice,
    type PluginEntry
} from '../plugins/pluginCatalog.js';
import { resetTwoFactor } from '@moteurio/core/twoFactor.js';
import {
    envServerSettings,
    readServerSettings,
    updateServerSettings,
    type ServerSettingsPatch
} from '@moteurio/core/serverSettings.js';
import emailRouter, { emailPaths } from './email.js';
import { serverInfo, serverPaths } from './server.js';

/**
 * Operator routes covering the whole server: every project, account and plugin, and the
 * operators themselves. Operators are not user accounts; see @moteurio/core/operators.
 */
const router: Router = Router();
router.use(requireOperator);

const params = (req: Request) => req.params as Record<string, string>;
/** The actor that changes are recorded under: the engine, named after the operator (set by requireOperator). */
const operator = (req: Request) => req.user as User;

function createdAt(p: ProjectSchema): string | undefined {
    const audit = (p as { meta?: { audit?: { createdAt?: string } } }).meta?.audit;
    return audit?.createdAt;
}

function projectRow(p: ProjectSchema, period: string) {
    const totals = getMeteringStore().requestTotals(period).projects[p.id];
    return {
        id: p.id,
        label: p.label || p.id,
        description: p.description,
        workspaceId: p.workspaceId,
        createdAt: createdAt(p),
        members: (p.users ?? []).length,
        defaultLocale: p.defaultLocale,
        supportedLocales: p.supportedLocales ?? [],
        /** Allowlist of project plugins. Null means every plugin the server runs. */
        plugins: p.plugins ?? null,
        month: {
            publicRequests: totals?.publicRequests ?? 0,
            submissions: totals?.submissions ?? 0,
            creditsUsed: creditBalance(p.id, period).used
        }
    };
}

function userRow(u: User, projectIds: Set<string>) {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        roles: u.roles ?? [],
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        twoFactor: Boolean(u.twoFactor),
        passkeys: u.passkeys?.length ?? 0,
        // Every project the user belongs to, whether added individually or through a workspace.
        projects: getProjectIdsForUser(u.id).filter(id => projectIds.has(id)),
        workspaces: workspacesOf(u.id).map(w => ({
            id: w.id,
            name: w.name,
            personal: !!w.personal,
            role: w.members[u.id]!.role
        }))
    };
}

function pluginRow(e: PluginEntry, choices: Record<string, boolean>, projects: ProjectSchema[]) {
    const next = runsNextStart(e, choices);
    const projectScoped = e.kind === 'host' && e.scope !== 'global';
    const contributions = mergeContributions(
        e.contributions,
        pluginRegistry.has(e.id) ? pluginRegistry.getContributions(e.id) : undefined
    );
    return {
        ...e,
        contributions,
        capabilities: capabilitiesFromContributions(contributions, e.capabilities as never),
        /** The operator's saved choice. Null means the host's list decides. */
        choice: e.kind === 'core' ? null : (choices[e.id] ?? null),
        runsNextStart: next,
        restartNeeded: next !== e.running,
        /** The number of projects the plugin applies to. Project plugins can be limited to specific projects. */
        projects: projectScoped
            ? projects.filter(p => !p.plugins || p.plugins.includes(e.id)).length
            : projects.length
    };
}

function allPlugins(): PluginEntry[] {
    const known = pluginEntries();
    const ids = new Set(known.map(e => e.id));
    const core: PluginEntry[] = Object.entries(pluginRegistry.all())
        .filter(([id]) => !ids.has(id))
        .map(([id, m]) => ({
            id,
            label: m.label || id,
            description: m.description,
            source: m.source,
            scope: m.scope ?? 'global',
            capabilities: m.capabilities,
            role: m.role,
            categories: m.categories,
            contributions: pluginRegistry.getContributions(id),
            requires: m.requires,
            studio: m.studio,
            kind: 'core' as const,
            running: true,
            hostAllows: true
        }));
    return [...core, ...known].sort(
        (a, b) => Number(a.kind === 'host') - Number(b.kind === 'host') || a.id.localeCompare(b.id)
    );
}

router.get('/summary', (req: Request, res: Response) => {
    try {
        const period = currentPeriod();
        const projects = loadProjects();
        reloadUsers();
        const users = listUsers();
        const totals = getMeteringStore().requestTotals(period);
        let publicRequests = 0;
        let submissions = 0;
        for (const row of Object.values(totals.projects)) {
            publicRequests += row.publicRequests;
            submissions += row.submissions ?? 0;
        }
        const monthStart = `${period}-01`;
        const plugins = allPlugins();
        const choices = readPluginChoices();
        res.json({
            period,
            projects: { total: projects.length },
            workspaces: { total: listWorkspaces().length },
            users: {
                total: users.length,
                active: users.filter(u => u.isActive).length,
                signedInThisMonth: users.filter(u => (u.lastLoginAt ?? '') >= monthStart).length
            },
            operators: listOperators().length,
            month: {
                publicRequests,
                studioRequests: totals.studio,
                submissions,
                creditsUsed: projects.reduce((n, p) => n + creditBalance(p.id, period).used, 0)
            },
            plugins: {
                running: plugins.filter(p => p.running).length,
                restartNeeded: plugins.some(p => runsNextStart(p, choices) !== p.running)
            }
        });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.get('/projects', (req: Request, res: Response) => {
    try {
        const period = currentPeriod();
        res.json({ projects: loadProjects().map(p => projectRow(p, period)) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Sets the project's plugin allowlist. Body: `{ plugins }`, a list of plugin ids, or null to allow all plugins. */
router.patch('/projects/:projectId', async (req: Request, res: Response) => {
    const { projectId } = params(req);
    const body = (req.body ?? {}) as { plugins?: unknown };
    if (!('plugins' in body)) return void res.status(400).json({ error: 'Nothing to change' });
    const plugins = body.plugins;
    if (
        plugins !== null &&
        !(Array.isArray(plugins) && plugins.every(p => typeof p === 'string'))
    ) {
        return void res
            .status(400)
            .json({ error: 'plugins must be a list of plugin ids, or null' });
    }
    const known = new Set(allPlugins().map(p => p.id));
    const unknown = (plugins ?? []).filter(p => !known.has(p as string));
    if (unknown.length) {
        return void res.status(400).json({ error: `Unknown plugins: ${unknown.join(', ')}` });
    }
    try {
        // null clears the allowlist (applyProjectPatch drops null keys).
        const updated = await updateProject(operator(req), projectId, {
            plugins: plugins as unknown as string[]
        });
        res.json({ project: projectRow(updated, currentPeriod()) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Lists every workspace on the server with its owners and its number of members and projects. */
router.get('/workspaces', (req: Request, res: Response) => {
    try {
        const counts = new Map<string, number>();
        for (const p of loadProjects())
            counts.set(p.workspaceId, (counts.get(p.workspaceId) ?? 0) + 1);
        res.json({
            workspaces: listWorkspaces().map(w => ({
                id: w.id,
                name: w.name,
                personal: !!w.personal,
                createdAt: w.createdAt,
                owners: Object.entries(w.members)
                    .filter(([, m]) => m.role === 'owner')
                    .map(([id]) => ({ id, email: getUserById(id)?.email })),
                members: Object.keys(w.members).length,
                projects: counts.get(w.id) ?? 0
            }))
        });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Lists deleted projects that are still in the trash, newest first. */
router.get('/projects/trash', (req: Request, res: Response) => {
    try {
        res.json({ projects: listTrashedProjects() });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Permanently removes a deleted project's copy from the trash. */
router.delete('/projects/trash/:folder', (req: Request, res: Response) => {
    try {
        purgeTrashedProject(params(req).folder!);
        res.status(204).send();
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Permanently deletes a project immediately, bypassing the trash. Its id becomes available again. */
router.delete('/projects/:projectId', async (req: Request, res: Response) => {
    try {
        await purgeProject(operator(req), params(req).projectId!);
        res.status(204).send();
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.get('/users', (req: Request, res: Response) => {
    try {
        reloadUsers();
        const projectIds = new Set(loadProjects().map(p => p.id));
        res.json({ users: listUsers().map(u => userRow(u, projectIds)) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Turns off two-step sign-in and ends all sessions, for a user who lost both their phone and their recovery codes. */
router.post('/users/:userId/two-factor/reset', async (req: Request, res: Response) => {
    const { userId } = params(req);
    try {
        if (!getUserById(userId)) return void res.status(404).json({ error: 'User not found' });
        await resetTwoFactor(userId);
        const updated = getUserById(userId)!;
        res.json({ user: userRow(updated, new Set(loadProjects().map(p => p.id))) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Updates an account. Body: any of `name`, `email`, `isActive` and `roles` (the account's roles, not project roles). */
router.patch('/users/:userId', async (req: Request, res: Response) => {
    const { userId } = params(req);
    const op = operator(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: { name?: string; email?: string; isActive?: boolean; roles?: string[] } = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.email === 'string') patch.email = body.email;
    if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
    if (body.roles !== undefined) {
        if (!Array.isArray(body.roles) || !body.roles.every(r => typeof r === 'string')) {
            return void res.status(400).json({ error: 'roles must be a list of role names' });
        }
        patch.roles = body.roles as string[];
    }
    if (!Object.keys(patch).length)
        return void res.status(400).json({ error: 'Nothing to change' });
    try {
        const updated = await updateUserAsOperator(userId, patch, op);
        const projectIds = new Set(loadProjects().map(p => p.id));
        res.json({ user: userRow(updated, projectIds) });
    } catch (err) {
        const message = (err as Error).message;
        if (/not found/i.test(message)) return void res.status(404).json({ error: message });
        if (/already in use|cannot be empty/i.test(message)) {
            return void res.status(409).json({ error: message });
        }
        sendApiError(res, req, err);
    }
});

// ---- operators ------------------------------------------------------------------------------

function operatorFailed(res: Response, req: Request, err: unknown) {
    if (err instanceof OperatorAuthError)
        return void res.status(err.status).json({ error: err.message });
    sendApiError(res, req, err);
}

router.get('/operators', (req: Request, res: Response) => {
    res.json({ operators: listOperators(), you: req.operator?.id });
});

/** Adds an operator. Body: `{ email, name? }`. Returns the token for the operator's one-time setup link, valid for 24 hours. */
router.post('/operators', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { email?: unknown; name?: unknown };
    try {
        const { operator, token } = addOperator(
            {
                email: typeof body.email === 'string' ? body.email : '',
                ...(typeof body.name === 'string' ? { name: body.name } : {})
            },
            req.operator!.email
        );
        console.log(`[operators] ${req.operator!.email} added ${operator.email}`);
        res.status(201).json({ operator, enrollToken: token });
    } catch (err) {
        operatorFailed(res, req, err);
    }
});

/** Resets an operator: removes their password, authenticator and sessions, and returns a new one-time setup link token. */
router.post('/operators/:id/reset', (req: Request, res: Response) => {
    try {
        const { operator, token } = resetOperator(params(req).id);
        console.log(`[operators] ${req.operator!.email} reset ${operator.email}`);
        res.json({ operator, enrollToken: token });
    } catch (err) {
        operatorFailed(res, req, err);
    }
});

router.delete('/operators/:id', (req: Request, res: Response) => {
    try {
        removeOperator(params(req).id);
        console.log(`[operators] ${req.operator!.email} removed operator ${params(req).id}`);
        res.status(204).end();
    } catch (err) {
        operatorFailed(res, req, err);
    }
});

// ---- server news ----------------------------------------------------------------------------

const NEWS_MAX = 200;

/** Lists new accounts, projects and workspaces from the last 90 days, newest first, along with when the operator last viewed them. */
router.get('/news', (req: Request, res: Response) => {
    try {
        const since = typeof req.query.since === 'string' ? req.query.since : undefined;
        const items = listServerNews(since).reverse();
        const you = listOperators().find(o => o.id === req.operator!.id);
        res.json({
            items: items.slice(0, NEWS_MAX),
            total: items.length,
            seenAt: you?.newsSeenAt ?? null,
            news: you?.news ?? 'each'
        });
    } catch (err) {
        operatorFailed(res, req, err);
    }
});

/** Marks the news as seen. Only items created after this moment count as new. */
router.post('/news/seen', (req: Request, res: Response) => {
    try {
        res.json({ operator: markOperatorNewsSeen(req.operator!.id) });
    } catch (err) {
        operatorFailed(res, req, err);
    }
});

/** Sets how the operator is emailed about news. Body: `{ news }`, one of `each`, `daily` or `off`. */
router.patch('/me', (req: Request, res: Response) => {
    const news = (req.body ?? {}).news as OperatorNewsMode;
    if (!OPERATOR_NEWS_MODES.includes(news))
        return void res.status(400).json({ error: 'news must be each, daily or off' });
    try {
        res.json({ operator: setOperatorNews(req.operator!.id, news) });
    } catch (err) {
        operatorFailed(res, req, err);
    }
});

router.get('/plugins', (req: Request, res: Response) => {
    try {
        const choices = readPluginChoices();
        const projects = loadProjects();
        res.json({ plugins: allPlugins().map(p => pluginRow(p, choices, projects)) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Switches a plugin on or off. Body: `{ on }`, true or false, or null to follow the host's list again. Takes effect at the next start. */
router.patch('/plugins/:pluginId', (req: Request, res: Response) => {
    const { pluginId } = params(req);
    const on = (req.body ?? {}).on;
    if (on !== true && on !== false && on !== null) {
        return void res.status(400).json({ error: 'on must be true, false or null' });
    }
    const entry = allPlugins().find(p => p.id === pluginId);
    if (!entry) return void res.status(404).json({ error: 'No such plugin' });
    if (entry.kind === 'core') {
        return void res
            .status(400)
            .json({ error: 'Core plugins are part of the engine and always on' });
    }
    try {
        const choices = savePluginChoice(pluginId, on, req.operator!.email);
        res.json({ plugin: pluginRow(entry, choices, loadProjects()) });
    } catch (err) {
        sendApiError(res, req, err);
    }
});

// ---- server settings -------------------------------------------------------------------------

/** Returns the server's configuration: version, sign-in, AI, MCP, email, and which environment variables are set. */
router.get('/server', (req: Request, res: Response) => {
    try {
        res.json(serverInfo());
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Returns the settings the operator saved and those set by the environment. A saved setting takes precedence. */
const settingsBody = () => ({ settings: readServerSettings(), env: envServerSettings() });

router.get('/settings', (req: Request, res: Response) => {
    try {
        res.json(settingsBody());
    } catch (err) {
        sendApiError(res, req, err);
    }
});

/** Updates server settings. Body: any of `termsUrl` and `privacyUrl`, each an https address or null to clear it. */
router.patch('/settings', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: ServerSettingsPatch = {};
    for (const key of ['termsUrl', 'privacyUrl'] as const) {
        if (!(key in body)) continue;
        const value = body[key];
        if (value !== null && typeof value !== 'string')
            return void res.status(400).json({
                error: `${key} must be an https address, or null`,
                code: 'URL_INVALID'
            });
        patch[key] = value;
    }
    if (!Object.keys(patch).length)
        return void res.status(400).json({ error: 'Nothing to change' });
    try {
        updateServerSettings(patch);
        console.log(`[operators] ${req.operator?.email ?? 'an operator'} changed server settings`);
        res.json(settingsBody());
    } catch (err) {
        sendApiError(res, req, err);
    }
});

router.use('/email', emailRouter);

const SCHEMA_KINDS: ServerSchemaKind[] = ['blocks', 'structures'];
const schemaKind = (req: Request) => {
    const kind = params(req).kind as ServerSchemaKind;
    return SCHEMA_KINDS.includes(kind) ? kind : null;
};

router.get('/schemas/:kind', (req: Request, res: Response) => {
    const kind = schemaKind(req);
    if (!kind) return void res.status(404).json({ error: 'Kinds are blocks and structures' });
    res.json({ items: listServerSchemas(kind) });
});

/** Adds a server-wide block or structure, or overrides a built-in one. `:name` is the part after `core/`. */
router.put('/schemas/:kind/:name', (req: Request, res: Response) => {
    const kind = schemaKind(req);
    if (!kind) return void res.status(404).json({ error: 'Kinds are blocks and structures' });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return void res.status(400).json({ error: 'Body must be a schema object' });
    }
    try {
        res.json({ item: saveServerSchema(kind, params(req).name, body) });
    } catch (err) {
        res.status(400).json({ error: (err as Error).message });
    }
});

/** Deletes the server's schema file. A built-in schema reverts to its shipped version. */
router.delete('/schemas/:kind/:name', (req: Request, res: Response) => {
    const kind = schemaKind(req);
    if (!kind) return void res.status(404).json({ error: 'Kinds are blocks and structures' });
    try {
        deleteServerSchema(kind, params(req).name);
        res.status(204).end();
    } catch (err) {
        res.status(404).json({ error: (err as Error).message });
    }
});

const ok = (
    description: string,
    properties: Record<string, OpenAPIV3.SchemaObject>
): OpenAPIV3.ResponsesObject => ({
    '200': {
        description,
        content: { 'application/json': { schema: { type: 'object', properties } } }
    },
    '401': { description: 'Not signed in' },
    '403': { description: 'Operator access required' }
});
const tags = ['Operator'];
const int: OpenAPIV3.SchemaObject = { type: 'integer' };
const str: OpenAPIV3.SchemaObject = { type: 'string' };
const strings: OpenAPIV3.SchemaObject = { type: 'array', items: str };
const object: OpenAPIV3.SchemaObject = { type: 'object', additionalProperties: true };
const projectRowSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        id: str,
        label: str,
        description: str,
        workspaceId: str,
        createdAt: { type: 'string', format: 'date-time' },
        members: { ...int, description: 'People added to it (its workspace’s team not counted)' },
        defaultLocale: str,
        supportedLocales: strings,
        plugins: { ...strings, nullable: true, description: 'Null: every plugin the server runs' },
        month: {
            type: 'object',
            properties: { publicRequests: int, submissions: int, creditsUsed: { type: 'number' } }
        }
    }
};
const userRowSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        id: str,
        name: str,
        email: str,
        avatar: str,
        roles: strings,
        isActive: { type: 'boolean' },
        lastLoginAt: { type: 'string', format: 'date-time' },
        projects: {
            ...strings,
            description: 'Every project they are in: added one by one, or through a workspace'
        },
        workspaces: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: str,
                    name: str,
                    personal: { type: 'boolean' },
                    role: { type: 'string', enum: ['owner', 'admin', 'billing', 'member'] }
                }
            }
        }
    }
};
const pluginRowSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        id: str,
        label: str,
        description: str,
        kind: { type: 'string', enum: ['core', 'host'] },
        role: { type: 'string', enum: ['platform', 'integration'] },
        categories: { type: 'array', items: { type: 'string' } },
        requires: strings,
        contributions: object,
        capabilities: strings,
        scope: str,
        running: { type: 'boolean' },
        choice: { type: 'boolean', nullable: true, description: "Null: follows the host's list" },
        runsNextStart: { type: 'boolean' },
        restartNeeded: { type: 'boolean' },
        projects: { ...int, description: 'How many projects it applies to' }
    }
};
const serverSchemaSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        type: str,
        schema: object,
        origin: { type: 'string', enum: ['shipped', 'file', 'changed'] }
    }
};

const paths: Record<string, OpenAPIV3.PathItemObject> = {
    '/operator/summary': {
        get: {
            summary: 'The whole server at a glance',
            description:
                'Projects, accounts (active, signed in this month), operators, this month’s requests, form submissions and AI credits across every project, and plugins. Operators only.',
            tags,
            responses: ok('`{ period, projects, users, operators, month, plugins }`', {
                period: str,
                projects: { type: 'object', properties: { total: int } },
                workspaces: { type: 'object', properties: { total: int } },
                users: {
                    type: 'object',
                    properties: { total: int, active: int, signedInThisMonth: int }
                },
                operators: int,
                month: {
                    type: 'object',
                    properties: {
                        publicRequests: int,
                        studioRequests: int,
                        submissions: int,
                        creditsUsed: { type: 'number' }
                    }
                },
                plugins: {
                    type: 'object',
                    properties: { running: int, restartNeeded: { type: 'boolean' } }
                }
            })
        }
    },
    '/operator/projects': {
        get: {
            summary: 'Every project on the server',
            description:
                'With members, languages, plugin allowlist (null: all) and this month’s requests, submissions and AI credits. Operators only, members or not.',
            tags,
            responses: ok('`{ projects }`', {
                projects: { type: 'array', items: projectRowSchema }
            })
        }
    },
    '/operator/workspaces': {
        get: {
            summary: 'Every workspace on the server',
            description:
                'With its owners, how many people are in it and how many projects it has. Operators only.',
            tags,
            responses: ok('`{ workspaces }`', {
                workspaces: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: str,
                            name: str,
                            personal: { type: 'boolean' },
                            createdAt: { type: 'string', format: 'date-time' },
                            owners: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: { id: str, email: str }
                                }
                            },
                            members: int,
                            projects: int
                        }
                    }
                }
            })
        }
    },
    '/operator/projects/{projectId}': {
        patch: {
            summary: 'Set which plugins a project may use',
            description:
                'Body `{ plugins }`: plugin ids, or null for every plugin the server runs. Recorded as the operator’s change.',
            tags,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                ...ok('`{ project }`', { project: projectRowSchema }),
                '400': { description: 'Unknown plugin ids' }
            }
        },
        delete: {
            summary: 'Delete a project for good',
            description:
                'At once, without the trash: its members lose it, its files and history are removed, and its id is free again. Its billing record stays (deleted). Operators only.',
            tags,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted for good' },
                '404': { description: 'No such project' }
            }
        }
    },
    '/operator/projects/trash': {
        get: {
            summary: 'Deleted projects still in the trash',
            description:
                'Newest first. `folder` names the copy (a project id deleted twice has two). Operators only.',
            tags,
            responses: ok('`{ projects }`: `{ id, deletedAt, folder }` each', {
                projects: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            deletedAt: { type: 'string', format: 'date-time' },
                            folder: { type: 'string' }
                        }
                    }
                }
            })
        }
    },
    '/operator/projects/trash/{folder}': {
        delete: {
            summary: 'Remove a deleted project from the trash, for good',
            description: 'Its files and history are gone. Operators only.',
            tags,
            parameters: [
                { name: 'folder', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Removed for good' },
                '404': { description: 'Not in the trash' }
            }
        }
    },
    '/operator/users': {
        get: {
            summary: 'Every account',
            description:
                'Name, email, account roles, active or not, last sign-in, projects. Operators only.',
            tags,
            responses: ok('`{ users }`', { users: { type: 'array', items: userRowSchema } })
        }
    },
    '/operator/users/{userId}/two-factor/reset': {
        post: {
            summary: 'Turn off a person’s two-step sign-in',
            description:
                'For someone who lost both their phone and their recovery codes: two-step sign-in goes off and every session of theirs ends. Check who is asking first.',
            tags: ['Operator'],
            parameters: [
                { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: '`{ user }`',
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { user: { type: 'object' } } }
                        }
                    }
                },
                '404': { description: 'No such user' }
            }
        }
    },
    '/operator/users/{userId}': {
        patch: {
            summary: 'Change an account',
            description:
                'Body: any of `name`, `email`, `isActive`, `roles` (account roles; `admin` makes an operator). You cannot deactivate yourself or drop your own operator role.',
            tags,
            parameters: [
                { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                ...ok('`{ user }`', { user: userRowSchema }),
                '404': { description: 'No such account' },
                '409': { description: 'Email already in use' }
            }
        }
    },
    '/operator/plugins': {
        get: {
            summary: 'Every plugin the server knows of',
            description:
                'Core (always on) and host plugins: running now, the operator’s choice, whether it runs after the next start, and how many projects it applies to.',
            tags,
            responses: ok('`{ plugins }`', { plugins: { type: 'array', items: pluginRowSchema } })
        }
    },
    '/operator/plugins/{pluginId}': {
        patch: {
            summary: 'Switch a host plugin on or off',
            description:
                'Body `{ on }`: true, false, or null to follow the host’s list. Saved in data/operator/plugins.json; plugins load at start, so it applies at the next restart.',
            tags,
            parameters: [
                { name: 'pluginId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                ...ok('`{ plugin }`', { plugin: pluginRowSchema }),
                '404': { description: 'No such plugin' }
            }
        }
    },
    '/operator/schemas/{kind}': {
        get: {
            summary: 'Server-wide blocks or structures',
            description:
                'Every `core/` block or structure offered to all projects, with where it comes from: `shipped` (engine or plugin), `file` (added on this server) or `changed` (a shipped one changed here).',
            tags,
            parameters: [
                {
                    name: 'kind',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', enum: SCHEMA_KINDS }
                }
            ],
            responses: ok('`{ items: [{ type, schema, origin }] }`', {
                items: { type: 'array', items: serverSchemaSchema }
            })
        }
    },
    '/operator/schemas/{kind}/{name}': {
        put: {
            summary: 'Add or change a server-wide block or structure',
            description:
                'Writes data/core/{kind}/{name}.json as `core/{name}`; needs a label and fields. Applies to every project at once.',
            tags,
            parameters: [
                {
                    name: 'kind',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', enum: SCHEMA_KINDS }
                },
                { name: 'name', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                ...ok('`{ item }`', { item: serverSchemaSchema }),
                '400': { description: 'Invalid name or schema' }
            }
        },
        delete: {
            summary: 'Remove a server-wide block or structure',
            description:
                'Deletes the server file. A shipped one comes back as it ships; shipped ones themselves cannot be deleted.',
            tags,
            parameters: [
                {
                    name: 'kind',
                    in: 'path',
                    required: true,
                    schema: { type: 'string', enum: SCHEMA_KINDS }
                },
                { name: 'name', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Removed' },
                '404': { description: 'No server file' }
            }
        }
    }
};

const settingsSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        termsUrl: { type: 'string', format: 'uri' },
        privacyUrl: { type: 'string', format: 'uri' }
    }
};
paths['/operator/settings'] = {
    get: {
        summary: 'Server settings',
        description:
            '`settings`: what operators saved (`server-settings.json`, beside the users file). `env`: what the environment gives (`MOTEUR_TERMS_URL`, `MOTEUR_PRIVACY_URL`). A saved setting wins; `GET /auth/signup` shows the result as `legal`.',
        tags,
        responses: ok('`{ settings, env }`', { settings: settingsSchema, env: settingsSchema })
    },
    patch: {
        summary: 'Change server settings',
        description:
            'Body: any of `termsUrl`, `privacyUrl`: an absolute https address (plain http only to localhost), or null to clear it (the environment’s applies again).',
        tags,
        requestBody: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            termsUrl: { type: 'string', nullable: true },
                            privacyUrl: { type: 'string', nullable: true }
                        }
                    }
                }
            }
        },
        responses: {
            ...ok('`{ settings, env }`', { settings: settingsSchema, env: settingsSchema }),
            '400': { description: 'Not an https address (`URL_INVALID`), or nothing to change' }
        }
    }
};

const operatorObject: OpenAPIV3.SchemaObject = {
    type: 'object',
    properties: {
        id: str,
        email: str,
        name: str,
        enrolled: { type: 'boolean' },
        createdAt: str,
        lastLoginAt: str,
        recoveryCodesLeft: int,
        news: {
            type: 'string',
            enum: ['each', 'daily', 'off'],
            description: 'How they hear about new accounts, projects and workspaces by email'
        },
        newsSeenAt: { type: 'string', format: 'date-time' }
    }
};
paths['/operator/operators'] = {
    get: {
        summary: 'The operators',
        description:
            'Who runs this server. Operators are not accounts; they live in OPERATORS_FILE.',
        tags,
        responses: ok('`{ operators, you }`', {
            operators: { type: 'array', items: operatorObject },
            you: str
        })
    },
    post: {
        summary: 'Add an operator',
        description:
            'Body `{ email, name? }`. Answers with `enrollToken`: their one-time link is `<studio>/operator/enroll/<enrollToken>` (24 hours), where they set a password and their authenticator.',
        tags,
        responses: ok('`{ operator, enrollToken }`', { operator: operatorObject, enrollToken: str })
    }
};
paths['/operator/operators/{id}/reset'] = {
    post: {
        summary: 'Start an operator’s sign-in again',
        description:
            'Their password, authenticator and recovery codes are removed and every session ends; `enrollToken` is their new one-time link.',
        tags,
        responses: ok('`{ operator, enrollToken }`', { operator: operatorObject, enrollToken: str })
    }
};
paths['/operator/operators/{id}'] = {
    delete: {
        summary: 'Remove an operator',
        description: 'Their sessions end at once. The last operator who can sign in stays.',
        tags,
        responses: { '204': { description: 'Removed' } }
    }
};

const newsItemSchema: OpenAPIV3.SchemaObject = {
    type: 'object',
    description:
        'As it was when it happened. `account`: email, name, method (email, provider, invite, added), provider, invitedBy, invitedTo, from. `project`: projectId, label, by, workspace or personal. `workspace`: workspaceId, name, by. `account-deleted`: email.',
    properties: {
        id: str,
        at: { type: 'string', format: 'date-time' },
        kind: { type: 'string', enum: ['account', 'project', 'workspace', 'account-deleted'] },
        userId: str
    },
    additionalProperties: true
};
paths['/operator/news'] = {
    get: {
        summary: 'What’s new on the server',
        description:
            'New accounts, projects and team workspaces, and accounts deleted by their owners, kept 90 days; newest first, at most 200 (`total` counts them all). `?since=` (ISO time) keeps only what came after. Demo copies and personal workspaces are not news. `seenAt`: when you last marked it seen; `news`: your email choice.',
        tags,
        parameters: [
            { name: 'since', in: 'query', schema: { type: 'string', format: 'date-time' } }
        ],
        responses: ok('`{ items, total, seenAt, news }`', {
            items: { type: 'array', items: newsItemSchema },
            total: int,
            seenAt: { type: 'string', format: 'date-time', nullable: true },
            news: { type: 'string', enum: ['each', 'daily', 'off'] }
        })
    }
};
paths['/operator/news/seen'] = {
    post: {
        summary: 'Mark what’s new as seen',
        description: 'For you only: what comes after now shows as new.',
        tags,
        responses: ok('`{ operator }`', { operator: operatorObject })
    }
};
paths['/operator/me'] = {
    patch: {
        summary: 'Choose how you hear about what’s new',
        description:
            'Body `{ news }`: `each` (an email as it happens; news within half a minute goes in one), `daily` (one email a day, only when something happened) or `off`. Emails start from now.',
        tags,
        requestBody: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: { news: { type: 'string', enum: ['each', 'daily', 'off'] } }
                    }
                }
            }
        },
        responses: {
            ...ok('`{ operator }`', { operator: operatorObject }),
            '400': { description: 'news is not each, daily or off' }
        }
    }
};

Object.assign(paths, emailPaths, serverPaths);

/** Every operator route requires an operator token (operatorAuth), never a user token. */
export const openapi: Record<string, OpenAPIV3.PathItemObject> = Object.fromEntries(
    Object.entries(paths).map(([path, item]) => [
        path,
        Object.fromEntries(
            Object.entries(item).map(([method, op]) => [
                method,
                typeof op === 'object' && op && !Array.isArray(op)
                    ? { ...op, security: [{ operatorAuth: [] }] }
                    : op
            ])
        )
    ])
);

export default router;

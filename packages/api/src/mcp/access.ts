/** OAuth consent is a server-enforced ceiling over the account's existing project roles. */
import { URL } from 'node:url';
import { API_COMMANDS, type CommandSpec, type ServerOptions } from '@moteurio/mcp';
import type { MoteurAdminClient } from '@moteurio/client';

export type McpAccessLevel = 'read' | 'content' | 'developer';
export interface McpAccessPolicy {
    level: McpAccessLevel;
    projectIds: string[];
    allowCreateProjects: boolean;
}
export interface McpConnection {
    /** Reloaded before each API request, including account membership, edits and revocation. */
    current(): McpAccessPolicy;
    created(projectId: string): Promise<void>;
}

const CONTENT = new Set([
    'entries',
    'media',
    'pages',
    'menus',
    'comments',
    'reviews',
    'notifications',
    'schedules',
    'submissions',
    'ai',
    'play'
]);
const INSPECT = new Set([
    ...CONTENT,
    'models',
    'layouts',
    'structures',
    'blocks',
    'templates',
    'forms',
    'channels',
    'site',
    'activity',
    'radar',
    'search'
]);
const GLOBAL_READS = new Set([
    'projects list',
    'auth whoami',
    'blueprints list',
    'blueprints get',
    'blocks core',
    'field-types list'
]);

export function permitsCommand(policy: McpAccessPolicy, command: CommandSpec): boolean {
    if (
        command.operator ||
        command.group === 'operator' ||
        command.group === 'api' ||
        command.offline
    )
        return false;
    // Hosted tools must never read files from the API host's filesystem.
    if (command.args?.some(a => ['file', 'files'].includes(a.name))) return false;
    if (
        command.readOnly &&
        [command.http, ...(command.covers ?? [])].some(call => call && !call.startsWith('GET '))
    )
        return false;
    const name = `${command.group} ${command.name}`;
    if (name === 'projects create')
        return policy.level === 'developer' && policy.allowCreateProjects;
    if (GLOBAL_READS.has(name)) return command.readOnly === true;
    // Unknown global commands cannot bypass the selected projects.
    if (!command.args?.some(a => a.name === 'project')) return false;
    if (command.group === 'billing' && !command.readOnly) return false;
    if (policy.level === 'developer') return true;
    if (command.readOnly)
        return (
            INSPECT.has(command.group) ||
            (command.group === 'projects' && ['get', 'describe'].includes(command.name))
        );
    return policy.level === 'content' && CONTENT.has(command.group);
}

export function scopedServerOptions(
    connection: McpConnection,
    defaultProject?: string,
    commands: CommandSpec[] = API_COMMANDS
): Pick<ServerOptions, 'commands' | 'beforeRun'> {
    const policy = connection.current();
    return {
        commands: commands
            .filter(c => permitsCommand(policy, c))
            .map(c => ({
                ...c,
                args: c.args?.filter(a => a.name !== 'out')
            })),
        beforeRun: (command, args) => {
            const policy = connection.current();
            if (args.out !== undefined)
                throw new Error('Hosted MCP cannot write files on the API server');
            if (!permitsCommand(policy, command))
                throw new Error('This tool is outside the connection’s current permissions');
            if (command.args?.some(a => a.name === 'project')) {
                const id = args.project ?? defaultProject;
                if (id !== undefined && !policy.projectIds.includes(String(id)))
                    throw new Error('This project was not granted to the MCP connection');
            }
        }
    };
}

const CONTENT_PATH =
    /^\/(?:assets|pages|menus|comments|reviews|notifications|schedules)(?:\/|$)|^\/models\/[^/]+\/entries(?:\/|$)|^\/forms\/[^/]+\/submissions(?:\/|$)/;
const INSPECT_PATH =
    /^\/(?:models|assets|pages|menus|comments|reviews|notifications|schedules|layouts|structures|blocks|templates|forms|activity|radar|search|collections|urls|navigation|breadcrumb|sitemap\.xml|sitemap\.json)(?:\/|$)/;
const GLOBAL_GET =
    /^\/(?:auth\/me|auth\/providers|openapi\.json|studio\/field-types|moteur\/blocks|ai\/status)$|^\/blueprints\/(?:projects|models|structures|templates)(?:\/|$)/;

/** Check actual outgoing requests as well as tool discovery. This covers custom/multi-call tools
 * and the client's high-level helpers, and refuses URL overrides that could leak credentials.
 */
export function restrictClient(client: MoteurAdminClient, connection: McpConnection): void {
    client._raw.defaults.maxRedirects = 0;
    const pathOf = (raw: string | undefined): string => {
        if (!raw?.startsWith('/') || raw.startsWith('//') || raw.includes('\\'))
            throw new Error('MCP calls must use a relative API path');
        const url = new URL(raw, 'http://mcp.internal');
        return url.pathname.replace(/\/$/, '') || '/';
    };
    const selected = (policy: McpAccessPolicy, id: unknown) =>
        typeof id === 'string' && policy.projectIds.includes(id);
    client._raw.interceptors.request.use(config => {
        const policy = connection.current();
        if (config.baseURL !== client.baseURL)
            throw new Error('MCP cannot override the API address');
        const path = pathOf(config.url);
        const method = config.method?.toUpperCase() ?? 'GET';
        if (path === '/projects') {
            if (method === 'GET') return config;
            if (method === 'POST' && policy.level === 'developer' && policy.allowCreateProjects)
                return config;
            throw new Error('This connection cannot create projects');
        }
        if (method === 'GET' && GLOBAL_GET.test(path)) return config;
        const match =
            /^\/projects\/([^/]+)(.*)$/.exec(path) ??
            /^\/billing\/projects\/([^/]+)(.*)$/.exec(path);
        if (match) {
            if (!selected(policy, decodeURIComponent(match[1])))
                throw new Error('This project was not granted to the MCP connection');
            const rest = match[2];
            if (
                policy.level !== 'developer' &&
                (path.startsWith('/billing/') ||
                    (method === 'GET' && rest !== '' && !INSPECT_PATH.test(rest)))
            )
                throw new Error('This information is outside the MCP connection’s access level');
            if (policy.level === 'read' && method !== 'GET')
                throw new Error('This MCP connection is read-only');
            if (policy.level === 'content' && method !== 'GET' && !CONTENT_PATH.test(rest))
                throw new Error(
                    'Content access cannot change schemas, settings, people or credentials'
                );
            return config;
        }
        const ai = /^\/ai\/(?:settings|helpers)\/([^/]+)$/.exec(path);
        if (ai && method === 'GET' && selected(policy, decodeURIComponent(ai[1]))) return config;
        // Project-bound AI actions carry their project in the JSON body.
        if (
            /^\/ai\/(?:write|translate\/field|analyse\/image|generate-image|generate-audio|generate-3d|save-generated-model|generate\/entry)$/.test(
                path
            ) &&
            method === 'POST' &&
            policy.level !== 'read'
        ) {
            const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
            if (selected(policy, data?.projectId)) return config;
        }
        throw new Error('This API operation is outside the MCP connection’s permissions');
    });
    client._raw.interceptors.response.use(async response => {
        const policy = connection.current();
        const path = pathOf(response.config.url);
        if (path === '/projects' && response.config.method?.toUpperCase() === 'POST') {
            const project = response.data?.project ?? response.data;
            if (typeof project?.id === 'string') await connection.created(project.id);
        } else if (path === '/projects' && Array.isArray(response.data?.projects)) {
            response.data = {
                ...response.data,
                projects: response.data.projects.filter((p: { id: string }) =>
                    selected(policy, p.id)
                )
            };
        } else if (path === '/auth/me' && response.data?.user) {
            response.data = {
                ...response.data,
                user: { ...response.data.user, projects: policy.projectIds }
            };
        }
        return response;
    });
}

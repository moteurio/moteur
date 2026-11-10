/**
 * The Moteur MCP server. It exposes every declared command as a tool, or in compact mode as three
 * tools that find, describe and run commands. It authenticates the same way the `moteur` CLI does.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
    API_COMMANDS,
    UsageError,
    available,
    checkArgs,
    configSession,
    getClientOrThrow,
    errorText,
    execute,
    type CommandSpec,
    type OpenApi,
    type Session
} from '@moteurio/commands';
import type { MoteurAdminClient } from '@moteurio/client';
import {
    inputSchema,
    selectCommands,
    toolName,
    toolOf,
    withoutLocalArgs,
    type Selection
} from './tools.js';
import { agentClient, agentName } from './agent.js';

export interface ServerOptions extends Selection {
    /** Offers three tools (find, describe, run) instead of one tool per command. */
    compact?: boolean;
    /** The project to use when a call names none. Defaults to MOTEUR_PROJECT, then .moteur.json, then the config file. */
    project?: string;
    /** Lets changes go live without a person's approval. The project's own workflow rules still apply. */
    allowPublish?: boolean;
    /** The name that changes are attributed to. Defaults to the MCP client's name, for example "Claude Code". */
    agentName?: string;
    /** The user's client, defaulting to the CLI's sign-in. The server acts as an agent on the user's behalf. */
    client?: () => Promise<MoteurAdminClient>;
    /** The session used to call the API, for the hosted server and tests. Defaults to an agent session for the user. */
    session?: (body: Record<string, unknown>) => Session;
    /**
     * False when the server runs somewhere other than the user's machine, such as the hosted
     * `/mcp`. Arguments that name files on disk are then not offered, and commands never touch the disk.
     */
    local?: boolean;
    /** The commands to offer, for tests. Defaults to every API command. */
    commands?: CommandSpec[];
    /** Server-side authorization, checked again on every tool execution in both standard and compact mode. */
    beforeRun?: (command: CommandSpec, args: Record<string, unknown>) => void | Promise<void>;
    /**
     * Returns the server's OpenAPI document. Tools whose routes are missing from it, such as those
     * of plugins the server does not run, are left out. Defaults to the server's /openapi.json, and
     * `false` offers every tool.
     */
    routes?: (() => Promise<OpenApi | undefined>) | false;
}

const INSTRUCTIONS = `Moteur is a headless CMS. These tools read and change one Moteur API.
Content lives in projects; a project has models (article, author…), and each model has entries with fields, often in several languages ({ "fr": "…", "en": "…" }).
Most tools take "project"; leave it out to use the default. Start with projects_list to find the person's projects. If none exist, ask what they want to build, their project's name and languages, then use projects_create (optionally blueprints_list to choose a starting point). Account creation and sign-in happen in the browser when connecting MCP; never ask for passwords or provider tokens in chat. A new account can create its first project using the same tools and account limits as Studio. If a plan limit requires checkout, send the person to Studio to choose a plan.
Once a project is chosen, use projects_describe: languages, how content goes live, and every model's fields in one answer. Then entries_list for a model. Pass the chosen project explicitly on subsequent calls when no default project is configured.
Entries are drafts until published (entries_publish), or go through review (entries_review, reviews_approve) when the project asks for it.
To change fields, entries_update takes "set": ["title.en=Under the ice", "readingTime=5"].
You act for the signed-in person: what you change is marked as yours ("Louise via Claude") until a person reads it, and goes live only once a person approves it. When publishing is refused, ask for a review (entries_review) and say so.`;

type Result = {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
};

const text = (value: unknown): string =>
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);

/** Formats a call's result for the model as the API's JSON text, and also as structured content when the result is an object. */
function ok(value: unknown): Result {
    const structured =
        value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    return {
        content: [{ type: 'text', text: text(value) }],
        ...(structured ? { structuredContent: structured } : {})
    };
}

const fail = (message: string): Result => ({
    content: [{ type: 'text', text: message }],
    isError: true
});

/** Returns the built-in commands plus extra specs from plugins. Specs whose group and name already exist in the catalog are skipped. */
export function withPluginCommands(
    extra: Array<Pick<CommandSpec, 'group' | 'name'> & Partial<CommandSpec>>
): CommandSpec[] {
    const seen = new Set(API_COMMANDS.map(c => `${c.group} ${c.name}`));
    const added: CommandSpec[] = [];
    for (const spec of extra) {
        const id = `${spec.group} ${spec.name}`;
        if (seen.has(id) || !spec.group) continue;
        seen.add(id);
        added.push(spec as CommandSpec);
    }
    return added.length ? [...API_COMMANDS, ...added] : API_COMMANDS;
}

export function createServer(options: ServerOptions = {}): Server {
    const all = options.commands ?? API_COMMANDS;
    const local = options.local !== false;
    const selected = selectCommands(all, options).map(c => (local ? c : withoutLocalArgs(c)));
    const server = new Server(
        { name: 'moteur', version: '2026.3.29' },
        { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
    );
    const client = agentClient(options.client ?? getClientOrThrow, () => ({
        name: options.agentName ?? agentName(server.getClientVersion()),
        reviewOnly: !options.allowPublish
    }));
    const session =
        options.session ??
        ((body: Record<string, unknown>) =>
            configSession({
                client,
                body: async () => body,
                local,
                ...(options.project ? { defaultProject: async () => options.project } : {})
            }));

    const routes =
        options.routes === false
            ? undefined
            : (options.routes ??
              (async () => (await session({}).client()).get<OpenApi>('/openapi.json')));
    /** Resolves the tools once: those the server has routes for, or all of them if the server cannot say. */
    let tools: Promise<{ offered: CommandSpec[]; byTool: Map<string, CommandSpec> }> | undefined;
    const offer = () =>
        (tools ??= (async () => {
            let offered = selected;
            try {
                const doc = routes ? await routes() : undefined;
                if (doc?.paths) offered = available(selected, doc);
            } catch {
                // The user is not signed in yet, or the API has no OpenAPI document, so offer every tool.
            }
            return { offered, byTool: new Map(offered.map(c => [toolName(c), c])) };
        })());

    /** Runs one command with the arguments of a tool call. */
    async function run(command: CommandSpec, input: Record<string, unknown>): Promise<Result> {
        try {
            const { body, ...rest } = input;
            const args = checkArgs(command.args ?? [], rest, { naming: a => a.name });
            await options.beforeRun?.(command, args);
            const result = await execute(command, args, {
                ...session((body as Record<string, unknown>) ?? {}),
                // A session supplied by the host cannot turn a hosted server into a local one.
                ...(local ? {} : { local: false })
            });
            return ok(result ?? { done: true });
        } catch (err) {
            return fail(err instanceof UsageError ? err.message : errorText(err));
        }
    }

    const compactTools = [
        {
            name: 'moteur_find',
            title: 'Find Moteur commands',
            description:
                'Lists the commands available (all, or those matching words), with what each does. Then describe one with moteur_describe and run it with moteur_run.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Words to look for: "publish entry", "alt text"…'
                    }
                }
            },
            annotations: { readOnlyHint: true, openWorldHint: false }
        },
        {
            name: 'moteur_describe',
            title: 'Describe a Moteur command',
            description: 'The arguments a command takes (as JSON Schema), and the call it makes.',
            inputSchema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'Its name: entries_list, media_upload…'
                    }
                },
                required: ['command']
            },
            annotations: { readOnlyHint: true, openWorldHint: false }
        },
        {
            name: 'moteur_run',
            title: 'Run a Moteur command',
            description: 'Runs a command with its arguments (see moteur_describe).',
            inputSchema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'Its name: entries_list, media_upload…'
                    },
                    arguments: {
                        type: 'object',
                        description: 'Its arguments',
                        additionalProperties: true
                    }
                },
                required: ['command']
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: !!options.allowDestructive,
                openWorldHint: false
            }
        }
    ];

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: options.compact ? compactTools : (await offer()).offered.map(toolOf)
    }));

    server.setRequestHandler(CallToolRequestSchema, async request => {
        const { offered, byTool } = await offer();
        const { name } = request.params;
        const input = (request.params.arguments ?? {}) as Record<string, unknown>;
        if (options.compact) {
            if (name === 'moteur_find') {
                const words = String(input.query ?? '')
                    .toLowerCase()
                    .split(/\s+/)
                    .filter(Boolean);
                const found = offered.filter(c => {
                    const hay = `${c.group} ${c.name} ${c.summary}`.toLowerCase();
                    return words.every(w => hay.includes(w));
                });
                return ok(
                    found.map(c => ({
                        command: toolName(c),
                        does: c.summary,
                        ...(c.destructive ? { cannotBeUndone: true } : {})
                    }))
                );
            }
            const command = byTool.get(String(input.command ?? ''));
            if (!command)
                return fail(`No command "${String(input.command)}". Find one with moteur_find.`);
            if (name === 'moteur_describe') {
                return ok({
                    command: toolName(command),
                    does: command.summary,
                    calls: command.http,
                    arguments: inputSchema(command)
                });
            }
            if (name === 'moteur_run')
                return run(command, (input.arguments as Record<string, unknown>) ?? {});
            return fail(`No tool "${name}".`);
        }
        const command = byTool.get(name);
        if (!command) return fail(`No tool "${name}".`);
        return run(command, input);
    });

    return server;
}

export { parseOptions } from './options.js';
export { agentName } from './agent.js';
export { selectCommands, toolName, OPT_IN_GROUPS } from './tools.js';
export { API_COMMANDS, type CommandSpec } from '@moteurio/commands';

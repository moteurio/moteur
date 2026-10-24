/**
 * The Moteur MCP server: every declared command as a tool (or, compact, three tools that find,
 * describe and run them), signed in the way the `moteur` CLI is.
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
import { inputSchema, selectCommands, toolName, toolOf, type Selection } from './tools.js';
import { agentClient, agentName } from './agent.js';

export interface ServerOptions extends Selection {
    /** Three tools (find, describe, run) instead of one per command. */
    compact?: boolean;
    /** The project when a call names none (default: MOTEUR_PROJECT, .moteur.json, config). */
    project?: string;
    /** Let changes go live without a person's approval (the project's own rules still apply). */
    allowPublish?: boolean;
    /** What changes are marked as made by (default: the MCP client's name, e.g. "Claude Code"). */
    agentName?: string;
    /** The person's client (default: the CLI's sign-in); the server acts as an agent for them. */
    client?: () => Promise<MoteurAdminClient>;
    /** The session to call the API with (the hosted server, tests); default: as an agent, for the person. */
    session?: (body: Record<string, unknown>) => Session;
    /** The commands to offer (tests); default: every API command. */
    commands?: CommandSpec[];
    /** Server-side authorization, checked again for every standard or compact tool execution. */
    beforeRun?: (command: CommandSpec, args: Record<string, unknown>) => void | Promise<void>;
    /**
     * The server's OpenAPI document, so tools whose routes it lacks (plugins it doesn't run) are
     * left out. Default: its /openapi.json; `false` offers every tool.
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

/** A call's answer for the model: the API's JSON as text (and as structured content when it's an object). */
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

export function createServer(options: ServerOptions = {}): Server {
    const all = options.commands ?? API_COMMANDS;
    const selected = selectCommands(all, options);
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
                ...(options.project ? { defaultProject: async () => options.project } : {})
            }));

    const routes =
        options.routes === false
            ? undefined
            : (options.routes ??
              (async () => (await session({}).client()).get<OpenApi>('/openapi.json')));
    /** The tools, once: those the server has routes for (all of them if it can't say). */
    let tools: Promise<{ offered: CommandSpec[]; byTool: Map<string, CommandSpec> }> | undefined;
    const offer = () =>
        (tools ??= (async () => {
            let offered = selected;
            try {
                const doc = routes ? await routes() : undefined;
                if (doc?.paths) offered = available(selected, doc);
            } catch {
                // Not signed in yet, or an API without the document: offer them all.
            }
            return { offered, byTool: new Map(offered.map(c => [toolName(c), c])) };
        })());

    /** Runs one command with a tool's arguments. */
    async function run(command: CommandSpec, input: Record<string, unknown>): Promise<Result> {
        try {
            const { body, ...rest } = input;
            const args = checkArgs(command.args ?? [], rest, { naming: a => a.name });
            await options.beforeRun?.(command, args);
            const result = await execute(
                command,
                args,
                session((body as Record<string, unknown>) ?? {})
            );
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

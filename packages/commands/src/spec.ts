/**
 * Commands are declared as data rather than written by hand. Each declaration lists the command's
 * typed arguments, what it sends and the API call it makes. Help text, argument checking, `--json`
 * output, the coverage check against the API's OpenAPI document and the MCP tools are all derived
 * from these declarations.
 */
import type { MoteurAdminClient } from '@moteurio/client';

export type ArgType = 'string' | 'number' | 'boolean' | 'list' | 'json';

export interface ArgSpec {
    /** The flag name in kebab-case, for example `--reading-time`. */
    name: string;
    type?: ArgType;
    description: string;
    required?: boolean;
    /** Also accepts the value as the nth word after the command, as in `moteur entries get <id>`. */
    positional?: number;
    choices?: readonly string[];
    /** Marks a list whose values may contain commas (`--set excerpt.en=Ice, then fire`). The flag is repeated for each value and a value is never split on commas. */
    whole?: boolean;
    default?: unknown;
    /** Alternative names that are also accepted, such as `projectId` or `id`. */
    aliases?: string[];
    /**
     * Where an HTTP command sends the value: the query string or the JSON body. An argument that
     * matches a `{name}` placeholder in the path is substituted there automatically. `none` means
     * the value is only used by the command itself and is not sent.
     */
    in?: 'query' | 'body' | 'none';
    /** The name used in the query or body when it differs from the flag name, for example `filter.author` or `data`. */
    key?: string;
    /**
     * Marks a path on the machine that runs the command, such as a file to read or write. It is
     * only offered when that machine belongs to the caller. A hosted server never offers it,
     * because its disk is not the caller's.
     */
    local?: boolean;
}

export interface Column {
    key: string;
    header: string;
    /** Converts the value to the text shown in the table. */
    format?: (value: unknown, row: Record<string, unknown>) => string;
}

export interface RunContext {
    args: Record<string, unknown>;
    client: () => Promise<MoteurAdminClient>;
    /** Resolves the project id from --project, MOTEUR_PROJECT, .moteur.json, or the default set by `moteur projects use`. */
    project: () => Promise<string>;
    /** Returns the JSON body from --file, --data or stdin, with the body arguments applied on top. */
    body: () => Promise<Record<string, unknown>>;
    /** Prints a line, unless --quiet or --json is set. */
    say: (message: string) => void;
    /** True when the command runs on the caller's own machine, so `local` paths refer to the caller's disk. */
    local: boolean;
}

export interface CommandSpec {
    /** The first word of the command, for example `entries`. */
    group: string;
    /** The second word of the command, for example `publish`. It is empty for a group's own action, as in `moteur status`. */
    name: string;
    summary: string;
    /** Longer description shown by `--help`. */
    description?: string;
    args?: ArgSpec[];
    /**
     * The API call as `METHOD /path`, with `{project}` and `{argName}` placeholders. Arguments that
     * are not in the path are sent where their `in` property says.
     */
    http?: string;
    /** With `json`, the body comes from --file, --data or stdin and the body arguments are applied on top. */
    body?: 'json';
    /** True when the route expects the project as `projectId` in the body, as the AI routes do. */
    projectInBody?: boolean;
    /** The response property shown in the table, such as `entries` in `{ entries, total }`. --json prints the whole response. */
    pick?: string;
    /** The columns of the table that list results are shown in when --json is not set. */
    table?: Column[];
    /** Builds the message printed after an action when --json is not set. */
    done?: (result: unknown, args: Record<string, unknown>) => string;
    /** Asks for confirmation before running, unless --yes is set. MCP marks the tool as destructive. */
    destructive?: boolean;
    /** Marks a command that only reads data. MCP marks the tool as read-only. */
    readOnly?: boolean;
    /** Runs in place of `http` when a command needs more than one API call, a file or a prompt. */
    run?: (ctx: RunContext) => Promise<unknown>;
    /**
     * Runs as an operator (see OPERATOR_ROUTES). It uses the operator session from
     * `moteur operator login` and never the user's own sign-in. It is never offered to agents.
     */
    operator?: boolean;
    /** The API operations that a `run` command covers, as `METHOD /path`. The coverage check uses this. */
    covers?: string[];
    /** Marks a command that does not need the API, such as local checks and login. */
    offline?: boolean;
    examples?: string[];
}

/**
 * Commands that a host plugin serves instead of the engine. They only work against a host that has
 * the plugin installed (api.moteur.io has them all). Keys are a group name, or `group name` for a
 * single command. An empty string marks a command in such a group that the engine serves itself.
 * The public command reference lists these commands by name only, and the host's own docs
 * describe them.
 */
export const PLUGIN_COMMANDS: Record<string, string> = {
    ai: 'AI helpers',
    billing: 'billing',
    search: 'search',
    shopify: 'Shopify',
    play: 'play blocks',
    'operator plans': 'billing',
    'operator update-plan': 'billing',
    'operator billing': 'billing',
    'operator grant-plan': 'billing',
    'operator end-grant': 'billing',
    'operator revenue': 'billing',
    // The engine serves the AI audit trail and the open oEmbed plugin serves the oEmbed commands.
    'ai audit': '',
    'ai audit-event': '',
    'play oembed': ''
};

/** Returns the host plugin that a command needs, if any (see PLUGIN_COMMANDS). */
export const pluginOf = (c: Pick<CommandSpec, 'group' | 'name'>): string | undefined =>
    (PLUGIN_COMMANDS[`${c.group} ${c.name}`] ?? PLUGIN_COMMANDS[c.group]) || undefined;

/** Declares a group of commands by setting the group name on each one. */
export const group = (name: string, commands: Omit<CommandSpec, 'group'>[]): CommandSpec[] =>
    commands.map(c => ({ ...c, group: name }));

// ---- Arguments most commands share --------------------------------------------------------

/** The project argument, used for `{project}` in paths. It is optional because a default project is usually set. */
export const project: ArgSpec = {
    name: 'project',
    description: 'Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`)',
    aliases: ['projectId'],
    in: 'none'
};

export const model: ArgSpec = {
    name: 'model',
    description: 'Model id',
    required: true,
    aliases: ['modelId']
};

/** The positional id of the resource a command acts on, as in `moteur entries get <id>`. */
export const id = (what: string, name = 'id'): ArgSpec => ({
    name,
    description: `${what} id`,
    required: true,
    positional: 0
});

/** The --file and --data arguments for commands that take a JSON body (stdin is read as well). */
export const BODY_ARGS: ArgSpec[] = [
    { name: 'file', description: 'Read the JSON body from this file', in: 'none' },
    { name: 'data', description: 'The JSON body, inline', in: 'none' }
];

/** The limit and offset arguments for list commands. */
export const paging = (defaultLimit?: number): ArgSpec[] => [
    {
        name: 'limit',
        type: 'number',
        description: 'How many to return',
        in: 'query',
        ...(defaultLimit ? { default: defaultLimit } : {})
    },
    { name: 'offset', type: 'number', description: 'How many to skip', in: 'query' }
];

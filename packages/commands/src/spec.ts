/**
 * Commands are declared, not hand-written: each says its arguments (with types), what it sends,
 * and the API call it makes. Help, argument checking, `--json` output, the coverage check against
 * the API's OpenAPI document, and (later) MCP tools all come from these declarations.
 */
import type { MoteurAdminClient } from '@moteurio/client';

export type ArgType = 'string' | 'number' | 'boolean' | 'list' | 'json';

export interface ArgSpec {
    /** The flag, kebab-case: `--reading-time`. */
    name: string;
    type?: ArgType;
    description: string;
    required?: boolean;
    /** Also accepted as the nth word after the command: `moteur entries get <id>`. */
    positional?: number;
    choices?: readonly string[];
    /** A list whose values may hold commas (`--set excerpt.en=Ice, then fire`): repeat it, never split. */
    whole?: boolean;
    default?: unknown;
    /** Older or shorter spellings that still work: `projectId`, `id`. */
    aliases?: string[];
    /**
     * Where an HTTP command puts it: a `{name}` in the path (automatic), the query string, or the
     * JSON body. `none` keeps it for the command's own use.
     */
    in?: 'query' | 'body' | 'none';
    /** Its name in the query or body when it differs: `filter.author`, `data`. */
    key?: string;
}

export interface Column {
    key: string;
    header: string;
    /** Turns the value into text for the table. */
    format?: (value: unknown, row: Record<string, unknown>) => string;
}

export interface RunContext {
    args: Record<string, unknown>;
    client: () => Promise<MoteurAdminClient>;
    /** The project: --project, MOTEUR_PROJECT, .moteur.json, or the default from `moteur projects use`. */
    project: () => Promise<string>;
    /** The JSON body from --file, --data or stdin, with body arguments laid over it. */
    body: () => Promise<Record<string, unknown>>;
    /** Prints a line unless --quiet or --json. */
    say: (message: string) => void;
}

export interface CommandSpec {
    /** First word: `entries`. */
    group: string;
    /** Second word: `publish`. Empty for a group's own action (`moteur status`). */
    name: string;
    summary: string;
    /** More detail for `--help`. */
    description?: string;
    args?: ArgSpec[];
    /**
     * The call, as `METHOD /path` with `{project}` and `{argName}` placeholders. Arguments that
     * aren't in the path go where their `in` says.
     */
    http?: string;
    /** `json`: the body comes from --file/--data/stdin (body arguments are laid over it). */
    body?: 'json';
    /** The route takes the project as `projectId` in the body (AI routes). */
    projectInBody?: boolean;
    /** The response property the table shows (`entries` of `{ entries, total }`); --json prints it all. */
    pick?: string;
    /** For list results: the table shown without --json. */
    table?: Column[];
    /** The line shown after an action without --json. */
    done?: (result: unknown, args: Record<string, unknown>) => string;
    /** Asks before running (unless --yes); MCP marks it destructive. */
    destructive?: boolean;
    /** Reads only; MCP marks it read-only. */
    readOnly?: boolean;
    /** Runs instead of `http` when a command needs more than one call, a file, or a prompt. */
    run?: (ctx: RunContext) => Promise<unknown>;
    /**
     * Runs as an operator (see OPERATOR_ROUTES): with the operator session from
     * `moteur operator login`, never the person's sign-in. Never offered to agents.
     */
    operator?: boolean;
    /** API operations a `run` command covers, as `METHOD /path` (for the coverage check). */
    covers?: string[];
    /** Doesn't need a signed-in API (local checks, login). */
    offline?: boolean;
    examples?: string[];
}

/** Lists a group's commands. */
export const group = (name: string, commands: Omit<CommandSpec, 'group'>[]): CommandSpec[] =>
    commands.map(c => ({ ...c, group: name }));

// ---- Arguments most commands share --------------------------------------------------------

/** The project; `{project}` in paths. Optional because a default usually exists. */
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

/** The thing a command is about: `moteur entries get <id>`. */
export const id = (what: string, name = 'id'): ArgSpec => ({
    name,
    description: `${what} id`,
    required: true,
    positional: 0
});

/** --file, --data and stdin, for commands whose body is JSON. */
export const BODY_ARGS: ArgSpec[] = [
    { name: 'file', description: 'Read the JSON body from this file', in: 'none' },
    { name: 'data', description: 'The JSON body, inline', in: 'none' }
];

/** Paging and search for list commands. */
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

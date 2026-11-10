/**
 * Where a plugin command is offered: the command line (`cli`) or MCP tools (`mcp`).
 */
export type PluginCommandSurface = 'cli' | 'mcp';

/** Value type of a command argument. */
export type PluginCommandArgType = 'string' | 'number' | 'boolean' | 'list' | 'json';

/** An argument of a plugin command. */
export interface PluginCommandArg {
    /** Flag name in kebab-case, for example `--reading-time`. */
    name: string;
    type?: PluginCommandArgType;
    description: string;
    required?: boolean;
    /** Also accepts the value as the nth word after the command. */
    positional?: number;
    choices?: readonly string[];
    default?: unknown;
    /** Alternative names that are also accepted. */
    aliases?: string[];
    /**
     * Where the value is sent: the query string or the JSON body. An argument that matches a
     * `{name}` placeholder in `http` is substituted into the path. `none` means the value is used
     * by the command only and is not sent.
     */
    in?: 'query' | 'body' | 'none';
    /** Name used in the query or body when it differs from the flag name. */
    key?: string;
}

/**
 * An HTTP command that a plugin registers for the CLI and MCP. It has the same shape as a
 * `@moteurio/commands` spec, without the `run` function and table settings, which exist only in
 * the commands package.
 */
export interface PluginCommandSpec {
    /** First word of the command, for example `entries`. */
    group: string;
    /** Second word of the command. Empty when the command is the group's own action. */
    name: string;
    summary: string;
    /** Longer description shown by `--help`. */
    description?: string;
    args?: PluginCommandArg[];
    /** `METHOD /path` with `{project}` and `{argName}` placeholders. */
    http?: string;
    /** With `json`, the request body comes from `--file`, `--data` or stdin, with the body arguments applied on top. */
    body?: 'json';
    /** True when the route expects the project as `projectId` in the body. */
    projectInBody?: boolean;
    /** Response property shown in the result table, such as `entries` in `{ entries, total }`. */
    pick?: string;
    /** Marks a command that only reads data. MCP marks the tool as read-only. */
    readOnly?: boolean;
    /** Asks for confirmation before running. MCP marks the tool as destructive. */
    destructive?: boolean;
    examples?: string[];
    /** Where the command is offered. Defaults to both `cli` and `mcp`. `registerMcpTool` sets `['mcp']`. */
    surfaces?: PluginCommandSurface[];
}

/** Returns the surfaces a command is offered on, defaulting to both `cli` and `mcp`. */
export function commandSurfaces(spec: PluginCommandSpec): PluginCommandSurface[] {
    return spec.surfaces?.length ? spec.surfaces : ['cli', 'mcp'];
}

/** Returns the command as typed in the CLI: the group and name separated by a space. */
export function commandCliId(spec: Pick<PluginCommandSpec, 'group' | 'name'>): string {
    return spec.name ? `${spec.group} ${spec.name}` : spec.group;
}

/** Returns the MCP tool name for a command: group and name joined by `_`, with other characters replaced by `_`. */
export function commandMcpId(spec: Pick<PluginCommandSpec, 'group' | 'name'>): string {
    const raw = spec.name ? `${spec.group}_${spec.name}` : spec.group;
    return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

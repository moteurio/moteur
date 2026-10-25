/**
 * HTTP command a plugin registers for the CLI and MCP. Same shape as a
 * `@moteurio/commands` spec without `run` / tables — those stay in the commands package.
 */
export type PluginCommandSurface = 'cli' | 'mcp';

export type PluginCommandArgType = 'string' | 'number' | 'boolean' | 'list' | 'json';

export interface PluginCommandArg {
    name: string;
    type?: PluginCommandArgType;
    description: string;
    required?: boolean;
    positional?: number;
    choices?: readonly string[];
    default?: unknown;
    aliases?: string[];
    in?: 'query' | 'body' | 'none';
    key?: string;
}

export interface PluginCommandSpec {
    group: string;
    name: string;
    summary: string;
    description?: string;
    args?: PluginCommandArg[];
    /** `METHOD /path` with `{project}` and `{argName}` placeholders. */
    http?: string;
    body?: 'json';
    projectInBody?: boolean;
    pick?: string;
    readOnly?: boolean;
    destructive?: boolean;
    examples?: string[];
    /** Default both. `registerMcpTool` sets `['mcp']`. */
    surfaces?: PluginCommandSurface[];
}

export function commandSurfaces(spec: PluginCommandSpec): PluginCommandSurface[] {
    return spec.surfaces?.length ? spec.surfaces : ['cli', 'mcp'];
}

export function commandCliId(spec: Pick<PluginCommandSpec, 'group' | 'name'>): string {
    return spec.name ? `${spec.group} ${spec.name}` : spec.group;
}

export function commandMcpId(spec: Pick<PluginCommandSpec, 'group' | 'name'>): string {
    const raw = spec.name ? `${spec.group}_${spec.name}` : spec.group;
    return raw.replace(/[^a-zA-Z0-9_]/g, '_');
}

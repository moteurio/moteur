/**
 * Converts declared commands to MCP tools. Each tool has a name, a JSON schema built from the
 * command's arguments, and annotations taken from the command's own flags, such as read-only or destructive.
 */
import type { ArgSpec, CommandSpec } from '@moteurio/commands';

/** Groups that are left out unless requested: billing and raw API calls. */
export const OPT_IN_GROUPS = ['billing', 'api'];

/** Commands that change this machine's sign-in or defaults or hand out tokens. They are never offered as tools. */
const LOCAL_ONLY = new Set(['projects use', 'auth refresh', 'auth agent-token']);

export interface Selection {
    /** Restricts the tools to these groups. Defaults to all groups except OPT_IN_GROUPS. */
    groups?: string[];
    /** Offers only read-only tools. */
    readOnly?: boolean;
    /** Includes tools whose changes cannot be undone, such as deleting, purging or merging. */
    allowDestructive?: boolean;
}

export function selectCommands(all: CommandSpec[], s: Selection = {}): CommandSpec[] {
    return all.filter(c => {
        if (LOCAL_ONLY.has(`${c.group} ${c.name}`)) return false;
        // Operator commands need the operator's own sign-in, so they are never offered to an agent.
        if (c.operator || c.group === 'operator') return false;
        if (s.groups ? !s.groups.includes(c.group) : OPT_IN_GROUPS.includes(c.group)) return false;
        if (s.readOnly && !c.readOnly) return false;
        if (c.destructive && !s.allowDestructive) return false;
        return true;
    });
}

/**
 * Returns the command as a hosted server offers it, without the arguments that name paths on the
 * machine running the server, because the server's disk is not the caller's. Passing such an
 * argument is then reported as an unknown option.
 */
export function withoutLocalArgs(c: CommandSpec): CommandSpec {
    if (!c.args?.some(a => a.local)) return c;
    return { ...c, args: c.args.filter(a => !a.local) };
}

/** Builds the tool name from a command, for example `entries list` becomes `entries_list`, `media-settings get` becomes `media_settings_get` and `status` stays `status`. */
export function toolName(c: CommandSpec): string {
    const name = c.name ? `${c.group}_${c.name}` : c.group === 'api' ? 'api_request' : c.group;
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

type JsonSchema = Record<string, unknown>;

function propertyOf(a: ArgSpec): JsonSchema {
    const description =
        a.default !== undefined ? `${a.description} (default ${String(a.default)})` : a.description;
    switch (a.type) {
        case 'number':
            return { type: 'number', description };
        case 'boolean':
            return { type: 'boolean', description };
        case 'list':
            return { type: 'array', items: { type: 'string' }, description };
        case 'json':
            return { description };
        default:
            return { type: 'string', description, ...(a.choices ? { enum: [...a.choices] } : {}) };
    }
}

/** Builds the tool's input schema from the command's arguments, plus `body` for commands that take JSON. */
export function inputSchema(c: CommandSpec): JsonSchema {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const a of c.args ?? []) {
        properties[a.name] = propertyOf(a);
        if (a.required && a.default === undefined) required.push(a.name);
    }
    if (c.body === 'json') {
        properties.body = {
            type: 'object',
            description: 'The JSON body (other arguments are laid over it)',
            additionalProperties: true
        };
    }
    return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false
    };
}

/** Builds the MCP tool for a command. */
export function toolOf(c: CommandSpec) {
    const method = c.http?.split(' ')[0];
    return {
        name: toolName(c),
        title: c.summary,
        description: [c.summary, c.description, c.http ? `Calls ${c.http}.` : '']
            .filter(Boolean)
            .join(' '),
        inputSchema: inputSchema(c),
        annotations: {
            title: c.summary,
            readOnlyHint: !!c.readOnly,
            destructiveHint: !!c.destructive,
            idempotentHint: method === 'GET' || method === 'PUT' || method === 'DELETE',
            openWorldHint: false
        }
    };
}

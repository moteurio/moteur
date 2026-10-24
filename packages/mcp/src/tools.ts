/**
 * Declared commands as MCP tools: a name, a JSON schema from the arguments, and annotations from
 * what the command says about itself (reads only, can't be undone).
 */
import type { ArgSpec, CommandSpec } from '@moteurio/commands';

/** Groups left out unless asked for: the server's operators, payments, and raw calls. */
export const OPT_IN_GROUPS = ['billing', 'api'];

/** Commands about this machine's sign-in or defaults, or handing out tokens: never tools. */
const LOCAL_ONLY = new Set(['projects use', 'auth refresh', 'auth agent-token']);

export interface Selection {
    /** Only these groups (default: all but OPT_IN_GROUPS). */
    groups?: string[];
    /** Reading tools only. */
    readOnly?: boolean;
    /** Include tools whose changes can't be undone (deleting, purging, merging…). */
    allowDestructive?: boolean;
}

export function selectCommands(all: CommandSpec[], s: Selection = {}): CommandSpec[] {
    return all.filter(c => {
        if (LOCAL_ONLY.has(`${c.group} ${c.name}`)) return false;
        // Running the whole server takes an operator's own sign-in: never an agent's tool.
        if (c.operator || c.group === 'operator') return false;
        if (s.groups ? !s.groups.includes(c.group) : OPT_IN_GROUPS.includes(c.group)) return false;
        if (s.readOnly && !c.readOnly) return false;
        if (c.destructive && !s.allowDestructive) return false;
        return true;
    });
}

/** `entries list` → `entries_list`; `media-settings get` → `media_settings_get`; `status` → `status`. */
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

/** The tool's input: its arguments, plus `body` for commands that take JSON. */
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

/** The MCP tool for a command. */
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

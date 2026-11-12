/**
 * Runs a declared command for either caller, the CLI or the MCP server. Arguments arrive as an
 * object. This module validates them, fills in the path, sends the API call and returns the
 * API's response.
 */
import type { MoteurAdminClient } from '@moteurio/client';
import type { ArgSpec, CommandSpec, RunContext } from './spec.js';
import {
    getClientOrThrow,
    getOperatorClientOrThrow,
    getProjectId,
    onProjectKey
} from './config.js';

/** Thrown when the command is used incorrectly, for example with a missing or invalid argument. It maps to exit code 2 and is not an API error. */
export class UsageError extends Error {}

/** Command groups whose routes come from a plugin, mapped to the plugin that provides them. */
export const PLUGIN_GROUPS: Record<string, string> = {
    ai: 'the AI plugin (Moteur Cloud)',
    billing: 'the billing plugin (Moteur Cloud)',
    shopify: 'the Shopify plugin',
    play: 'the poll plugin',
    search: 'a search plugin (Meilisearch or Algolia)'
};

/** Thrown when the server has no such route, which is Express's own 404 and not a response from a route handler. */
export class NotOnServer extends Error {
    readonly status = 404;
}

function isMissingRoute(err: unknown): boolean {
    const e = err as { status?: number; response?: { data?: unknown } };
    return (
        e?.status === 404 &&
        typeof e.response?.data === 'string' &&
        /Cannot (GET|POST|PUT|PATCH|DELETE) \//.test(e.response.data)
    );
}

/** A list of commands that can be looked up by the words on the command line. */
export class Commands {
    private list: CommandSpec[] = [];

    add(specs: CommandSpec[]): this {
        for (const s of specs) {
            if (this.find(s.group, s.name))
                throw new Error(`Command "${s.group} ${s.name}" declared twice`);
            this.list.push(s);
        }
        return this;
    }

    all(): CommandSpec[] {
        return this.list;
    }

    groups(): string[] {
        return [...new Set(this.list.map(c => c.group))];
    }

    inGroup(group: string): CommandSpec[] {
        return this.list.filter(c => c.group === group);
    }

    find(group: string, name: string): CommandSpec | undefined {
        return this.list.find(c => c.group === group && c.name === name);
    }

    /** Finds the command that the leading words name and returns it with the remaining words as positionals. */
    resolve(words: string[]): { command?: CommandSpec; rest: string[] } {
        const [g, n, ...rest] = words;
        if (!g) return { rest: [] };
        const named = n !== undefined ? this.find(g, n) : undefined;
        if (named) return { command: named, rest };
        const own = this.find(g, '');
        return own
            ? { command: own, rest: n === undefined ? [] : [n, ...rest] }
            : { rest: words.slice(1) };
    }
}

/** Formats an argument name for messages: `--limit` on the command line and `limit` for MCP tools. */
export type Naming = (arg: ArgSpec) => string;
export const asFlag: Naming = a => `--${a.name}`;

/** Converts one argument value, given as text or JSON, to its declared type. */
export function coerce(arg: ArgSpec, raw: unknown, name: Naming = asFlag): unknown {
    const type = arg.type ?? 'string';
    const one = Array.isArray(raw) && type !== 'list' ? raw[raw.length - 1] : raw;
    switch (type) {
        case 'boolean':
            if (typeof one === 'boolean') return one;
            if (/^(true|1|yes)$/i.test(String(one))) return true;
            if (/^(false|0|no)$/i.test(String(one))) return false;
            throw new UsageError(`${name(arg)} is yes or no (true/false), not "${String(one)}"`);
        case 'number': {
            const n = typeof one === 'number' ? one : Number(one);
            if (one === true || one === '' || Number.isNaN(n))
                throw new UsageError(`${name(arg)} needs a number`);
            return n;
        }
        case 'list': {
            // Split a single comma-separated value `a,b` into two values. A value already given as a list is kept as is.
            const values = Array.isArray(raw)
                ? raw.map(String)
                : arg.whole
                  ? [String(raw)]
                  : String(raw).split(',');
            return values.map(v => v.trim()).filter(Boolean);
        }
        case 'json':
            if (typeof one !== 'string') return one;
            try {
                return JSON.parse(one);
            } catch {
                throw new UsageError(`${name(arg)} isn’t valid JSON`);
            }
        default:
            if (one === true || one === undefined)
                throw new UsageError(`${name(arg)} needs a value`);
            if (arg.choices && !arg.choices.includes(String(one))) {
                throw new UsageError(`${name(arg)} is one of: ${arg.choices.join(', ')}`);
            }
            return String(one);
    }
}

/** Finds the closest known name, for "did you mean" suggestions. */
export function closest(word: string, names: string[]): string | undefined {
    const distance = (a: string, b: string) => {
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++)
            for (let j = 1; j <= b.length; j++)
                d[i][j] = Math.min(
                    d[i - 1][j] + 1,
                    d[i][j - 1] + 1,
                    d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
        return d[a.length][b.length];
    };
    const best = names.map(n => [n, distance(word, n)] as const).sort((a, b) => a[1] - b[1])[0];
    return best && best[1] <= Math.max(2, Math.floor(word.length / 3)) ? best[0] : undefined;
}

/**
 * Validates the given values against the declared arguments. Each value must match a known
 * argument by name or alias and is converted to its type. Defaults are then filled in and required
 * arguments are checked.
 */
export function checkArgs(
    specs: ArgSpec[],
    values: Record<string, unknown>,
    options: { naming?: Naming; normalize?: (key: string) => string } = {}
): Record<string, unknown> {
    const name = options.naming ?? asFlag;
    const norm = options.normalize ?? ((k: string) => k);
    const byName = new Map<string, ArgSpec>();
    for (const a of specs) {
        byName.set(a.name, a);
        for (const alias of a.aliases ?? []) byName.set(norm(alias), a);
    }
    const out: Record<string, unknown> = {};
    for (const [rawKey, value] of Object.entries(values)) {
        if (value === undefined) continue;
        const key = norm(rawKey);
        const arg = byName.get(key);
        if (!arg) {
            const hint = closest(key, [...new Set(specs.map(a => a.name))]);
            const shown = name({ name: key, description: '' });
            throw new UsageError(
                `Unknown option ${shown}${hint ? ` (did you mean ${name({ name: hint, description: '' })}?)` : ''}`
            );
        }
        out[arg.name] = coerce(arg, value, name);
    }
    for (const a of specs) {
        if (out[a.name] === undefined && a.default !== undefined) out[a.name] = a.default;
        if (a.required && out[a.name] === undefined) {
            throw new UsageError(
                `${name(a)} is required: ${a.description.charAt(0).toLowerCase()}${a.description.slice(1)}`
            );
        }
    }
    return out;
}

/** Substitutes the arguments into a path template such as `/projects/{project}/models/{model}`. */
export function fillPath(
    template: string,
    args: Record<string, unknown>,
    project?: string
): string {
    return template.replace(/\{(\w[\w-]*)\}/g, (_, key: string) => {
        const value = key === 'project' ? project : args[key];
        if (value === undefined || value === '') throw new UsageError(`--${key} is required`);
        return encodeURIComponent(String(value));
    });
}

/** Sets a nested value in an object from a dotted path such as `a.b.c`, used for body keys like `options.multilingual`. */
function setPath(target: Record<string, unknown>, dotted: string, value: unknown): void {
    const parts = dotted.split('.');
    let at = target;
    for (const p of parts.slice(0, -1)) at = (at[p] ??= {}) as Record<string, unknown>;
    at[parts[parts.length - 1]] = value;
}

/** Supplies what a command needs besides its own arguments: the API client, the default project and the request body. */
export interface Session {
    client: () => Promise<MoteurAdminClient>;
    /** Returns the project to use when no `project` argument is given. */
    defaultProject: () => Promise<string | undefined>;
    /** Returns the JSON body from the caller: --file, --data or stdin in the CLI, and `body` in MCP. */
    body?: () => Promise<Record<string, unknown>>;
    /** Prints progress lines for users. The CLI prints them and MCP tools ignore them. */
    say?: (message: string) => void;
    /** Logs each request when true. */
    debug?: boolean;
    /** Returns the client for operator commands. Defaults to the operator session on this machine. */
    operatorClient?: () => Promise<MoteurAdminClient>;
    /**
     * False on a hosted server. The disk belongs to the server, so commands never read or write
     * paths supplied by the caller. Defaults to true for the CLI and the local MCP process.
     */
    local?: boolean;
}

/** Builds a session from MOTEUR_TOKEN or MOTEUR_API_KEY, or else from ~/.moteur/config.json. */
export function configSession(over: Partial<Session> = {}): Session {
    let client: MoteurAdminClient | undefined;
    return {
        client: async () => (client ??= await getClientOrThrow()),
        defaultProject: () => getProjectId({}),
        ...over
    };
}

export function makeContext(
    command: CommandSpec,
    args: Record<string, unknown>,
    session: Session
): RunContext {
    return {
        args,
        // Operator commands never use the user's own sign-in.
        client: command.operator
            ? (session.operatorClient ?? getOperatorClientOrThrow)
            : session.client,
        project: async () => {
            const id = (args.project as string | undefined) ?? (await session.defaultProject());
            if (id) return id;
            // A project key identifies its project.
            if (!command.operator && (await onProjectKey())) {
                const client = await session.client();
                return (await client.get<{ projectId: string }>('/keys/me')).projectId;
            }
            throw new UsageError(
                'Which project? Give project (--project), or set a default: moteur projects use <id>'
            );
        },
        body: async () => {
            const base =
                command.body === 'json' && session.body ? { ...(await session.body()) } : {};
            for (const a of command.args ?? []) {
                if (a.in === 'body' && args[a.name] !== undefined)
                    setPath(base, a.key ?? a.name, args[a.name]);
            }
            return base;
        },
        say: message => session.say?.(message),
        local: session.local !== false
    };
}

/** Sends an `http` command, building the path, query and body from the arguments. */
async function callHttp(command: CommandSpec, ctx: RunContext, debug?: boolean): Promise<unknown> {
    const [method, template] = command.http!.split(' ');
    const project = template.includes('{project}') ? await ctx.project() : undefined;
    const url = fillPath(template, ctx.args, project);
    const params: Record<string, unknown> = {};
    for (const a of command.args ?? []) {
        const v = ctx.args[a.name];
        if (a.in !== 'query' || v === undefined) continue;
        params[a.key ?? a.name] = Array.isArray(v) ? v.join(',') : v;
    }
    const hasBody = method !== 'GET' && method !== 'DELETE';
    const data = hasBody ? await ctx.body() : undefined;
    if (data && command.projectInBody) data.projectId = await ctx.project();
    if (debug)
        console.error(`→ ${method} ${url}`, Object.keys(params).length ? params : '', data ?? '');
    return (await ctx.client()).request({ method, url, params, data });
}

/** Runs a command with validated arguments and returns the API's response, or the result of the command's own `run`. */
export async function execute(
    command: CommandSpec,
    args: Record<string, unknown>,
    session: Session
): Promise<unknown> {
    const ctx = makeContext(command, args, session);
    try {
        return await (command.run ? command.run(ctx) : callHttp(command, ctx, session.debug));
    } catch (err) {
        if (!isMissingRoute(err)) throw err;
        const words = `${command.group} ${command.name}`.trim();
        const plugin = PLUGIN_GROUPS[command.group];
        throw new NotOnServer(
            plugin
                ? `This server can’t ${words}: it needs ${plugin}.`
                : `This server can’t ${words}: it has no ${command.http ?? 'such route'} (an older API?).`
        );
    }
}

/**
 * Which API operations have a command. The OpenAPI document is the list of everything the engine
 * (and its plugins) can do; every operation needs a command, or a reason in SKIPPED.
 */
import type { CommandSpec } from './spec.js';

/** Operations without a command on purpose, with why. Same `METHOD /path` form as `http`. */
export const SKIPPED: Record<string, string> = {
    'POST /operator/auth/login': 'moteur operator login (prompts, keeps the operator session)',
    'GET /operator/auth/enroll/{token}': 'an operator’s one-time link, opened in the Studio',
    'POST /operator/auth/enroll/{token}': 'an operator’s one-time link, finished in the Studio',
    'GET /operator/auth/me': 'moteur operator whoami reads the local session',
    'GET /auth/github': 'browser sign-in redirect',
    'GET /auth/github/callback': 'browser sign-in redirect',
    'GET /auth/google': 'browser sign-in redirect',
    'GET /auth/google/callback': 'browser sign-in redirect',
    'GET /auth/microsoft': 'browser sign-in redirect',
    'GET /auth/microsoft/callback': 'browser sign-in redirect',
    'GET /auth/oidc': 'browser sign-in redirect',
    'GET /auth/oidc/callback': 'browser sign-in redirect',
    'POST /auth/login':
        'signing in with a password: the command line’s `moteur auth login`, not a shared command',
    'POST /mcp': 'the MCP server itself: its tools are these commands',
    'POST /webhooks/stripe': 'received from Stripe',
    'POST /webhooks/github': 'received from GitHub',
    'POST /webhooks/slack': 'received from Slack',
    'POST /webhooks/vercel': 'received from Vercel',
    'POST /webhooks/mux': 'received from Mux',
    'POST /webhooks/vimeo': 'received from Vimeo',
    'POST /webhooks/cloudflare-stream': 'received from Cloudflare Stream',
    'POST /webhooks/shopify': 'received from Shopify',
    'POST /projects/{x}/play/polls/{x}/vote': 'visitors vote on the site',
    'POST /projects/{x}/forms/{x}/submit': 'visitors send it from the site',
    'POST /auth/two-factor/verify':
        'the second step of signing in: the command line’s `moteur auth login` asks for the code',
    'GET /auth/two-factor': 'a person’s own sign-in: in the Studio, not through an agent',
    'POST /auth/two-factor/setup': 'a person’s own sign-in: in the Studio, not through an agent',
    'POST /auth/two-factor/enable': 'a person’s own sign-in: in the Studio, not through an agent',
    'POST /auth/two-factor/disable': 'a person’s own sign-in: in the Studio, not through an agent',
    'POST /auth/two-factor/recovery-codes':
        'a person’s own sign-in: in the Studio, not through an agent',
    'PUT /projects/{x}/git/token':
        'a secret: set in the Studio, never through an agent or a shell history',
    'DELETE /projects/{x}/git/token': 'with the token it removes, in the Studio',
    'GET /projects/{x}/presence/debug': 'presence debugging, for developers of the Studio',
    'DELETE /projects/{x}/presence/screen/{x}': 'presence debugging, for developers of the Studio',
    'POST /studio/assets/migrate-provider': 'deprecated: moteur media-settings move-videos',
    'GET /projects/{x}/channels/{x}/forms': 'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/forms/{x}':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/layouts':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/layouts/{x}':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/menus': 'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/menus/{x}':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/pages': 'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/pages/by-slug/{x}':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/pages/{x}':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/{x}/entries':
        'what a frontend reads through a channel (moteur api)',
    'GET /projects/{x}/channels/{x}/{x}/entries/{x}':
        'what a frontend reads through a channel (moteur api)'
};

/** `/projects/{projectId}/models/{modelId}` and `/projects/{project}/models/{model}` alike. */
export const normalize = (op: string): string => {
    const [method, path] = op.split(' ');
    return `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, '{x}').replace(/\/+$/, '')}`;
};

/** The operations a command covers: its `covers`, else its `http`. */
export function operationsOf(command: CommandSpec): string[] {
    return (command.covers ?? (command.http ? [command.http] : [])).map(normalize);
}

export interface Coverage {
    total: number;
    covered: string[];
    skipped: string[];
    missing: string[];
    /** Commands calling something the document doesn't list (typos, removed routes). */
    unknown: { command: string; op: string }[];
}

export type OpenApi = { paths?: Record<string, object | undefined> };
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Every operation a document lists, normalized. */
const operations = (doc: OpenApi): string[] =>
    Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
        Object.keys(item ?? {})
            .filter(m => METHODS.includes(m))
            .map(m => normalize(`${m} ${path}`))
    );

export function coverage(commands: CommandSpec[], doc: OpenApi): Coverage {
    const ops = operations(doc);
    const known = new Set(ops);
    const byCommand = new Set(commands.flatMap(operationsOf));
    const skipped = new Set(Object.keys(SKIPPED).map(normalize));
    return {
        total: ops.length,
        covered: ops.filter(o => byCommand.has(o)),
        skipped: ops.filter(o => !byCommand.has(o) && skipped.has(o)),
        missing: ops.filter(o => !byCommand.has(o) && !skipped.has(o)),
        unknown: commands.flatMap(c =>
            operationsOf(c)
                .filter(o => !known.has(o))
                .map(op => ({ command: `${c.group} ${c.name}`.trim(), op }))
        )
    };
}

/**
 * The commands a server can run: those whose calls its OpenAPI document lists (plugin routes
 * included). Commands that make no call (local settings) always stay.
 */
export function available(commands: CommandSpec[], doc: OpenApi): CommandSpec[] {
    const known = new Set(operations(doc));
    return commands.filter(c => operationsOf(c).every(o => known.has(o)));
}

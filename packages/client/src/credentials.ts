/**
 * Credential resolution for Moteur API access.
 * Environment variables (MOTEUR_TOKEN, MOTEUR_API_URL) take precedence and are
 * used exclusively by web Atelier sessions; when present, config files are never touched.
 * Safe to load in browser: no Node globals or modules at top level.
 */

export interface MoteurCredentials {
    token?: string;
    apiKey?: string;
    apiUrl: string;
    projectId: string | null;
    source: 'environment' | 'file';
}

export class MoteurClientError extends Error {
    code: string;
    hint?: string;

    constructor(options: { code: string; message: string; hint?: string }) {
        super(options.message);
        this.name = 'MoteurClientError';
        this.code = options.code;
        this.hint = options.hint;
        Object.setPrototypeOf(this, MoteurClientError.prototype);
    }
}

function isNode(): boolean {
    return typeof process !== 'undefined' && typeof process.env === 'object';
}

/** Config file path; only computed in Node, using string concat to avoid importing path in browser. */
function getConfigFilePath(): string {
    if (!isNode()) return '';
    const env = process!.env!;
    const dir =
        typeof env.MOTEUR_CONFIG_DIR === 'string'
            ? env.MOTEUR_CONFIG_DIR.trim()
            : (env.HOME ?? env.USERPROFILE ?? '.') + '/.moteur';
    return dir + '/config.json';
}

export function getConfigPath(): string {
    return getConfigFilePath();
}

function parseConfigFile(raw: string): MoteurCredentials {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.remotes && typeof data.remotes === 'object') {
        const remotes = data.remotes as Record<
            string,
            { url?: string; token?: string; apiKey?: string; projectId?: string }
        >;
        const defName = (data.default as string) ?? 'default';
        const r = remotes[defName] ?? remotes.default ?? Object.values(remotes)[0];
        if (r) {
            return {
                apiUrl: (r.url ?? '').trim() || 'http://localhost:3000',
                token: typeof r.token === 'string' ? r.token.trim() : undefined,
                apiKey: typeof r.apiKey === 'string' ? r.apiKey.trim() : undefined,
                projectId: typeof r.projectId === 'string' ? r.projectId.trim() : null,
                source: 'file'
            };
        }
    }
    return {
        apiUrl:
            typeof data.apiUrl === 'string'
                ? (data.apiUrl as string).trim()
                : 'http://localhost:3000',
        token: typeof data.token === 'string' ? (data.token as string).trim() : undefined,
        apiKey: typeof data.apiKey === 'string' ? (data.apiKey as string).trim() : undefined,
        projectId: typeof data.projectId === 'string' ? (data.projectId as string).trim() : null,
        source: 'file'
    };
}

const DEFAULT_CREDENTIALS: MoteurCredentials = {
    apiUrl: 'http://localhost:3000',
    projectId: null,
    source: 'file'
};

export async function readConfigFile(): Promise<MoteurCredentials> {
    const configFile = getConfigFilePath();
    if (!configFile || !isNode()) return DEFAULT_CREDENTIALS;
    try {
        const fs = await import('node:fs');
        if (fs.existsSync(configFile)) {
            const raw = fs.readFileSync(configFile, 'utf-8');
            return parseConfigFile(raw);
        }
    } catch {
        // ignore
    }
    return DEFAULT_CREDENTIALS;
}

/** Get env var from process.env (Node) or import.meta.env (Vite/browser). */
function getEnv(name: string): string | undefined {
    if (isNode()) {
        const v = process.env[name];
        if (typeof v === 'string') return v.trim();
    }
    const meta =
        typeof import.meta !== 'undefined' &&
        (import.meta as { env?: Record<string, unknown> }).env;
    if (meta && typeof meta === 'object') {
        const v = meta[name] ?? meta[`VITE_${name}`];
        return typeof v === 'string' ? v.trim() : undefined;
    }
    return undefined;
}

/**
 * Resolve credentials for API access.
 * Precedence: `MOTEUR_TOKEN` → `MOTEUR_API_KEY` (+ URL + project) → config file.
 * When credentials come from environment variables, config files are not read.
 * In the browser, uses `import.meta.env` (Vite: `VITE_MOTEUR_*`) when `process.env` is unavailable.
 */
export async function resolveCredentials(): Promise<MoteurCredentials> {
    const token = getEnv('MOTEUR_TOKEN') ?? getEnv('VITE_MOTEUR_TOKEN');
    const apiKey = getEnv('MOTEUR_API_KEY') ?? getEnv('VITE_MOTEUR_API_KEY');
    const apiUrl = getEnv('MOTEUR_API_URL') ?? getEnv('VITE_MOTEUR_API_URL');
    const projectId = getEnv('MOTEUR_PROJECT') ?? getEnv('VITE_MOTEUR_PROJECT') ?? null;

    if (token) {
        if (!apiUrl) {
            throw new MoteurClientError({
                code: 'MOTEUR_E_CONFIG',
                message: 'MOTEUR_TOKEN is set but MOTEUR_API_URL is missing',
                hint: 'Set MOTEUR_API_URL alongside MOTEUR_TOKEN (or VITE_MOTEUR_* in browser)'
            });
        }
        return {
            token,
            apiUrl,
            projectId: projectId ?? null,
            source: 'environment'
        };
    }

    if (apiKey) {
        if (!apiUrl) {
            throw new MoteurClientError({
                code: 'MOTEUR_E_CONFIG',
                message: 'MOTEUR_API_KEY is set but MOTEUR_API_URL is missing',
                hint: 'Set MOTEUR_API_URL (and MOTEUR_PROJECT) alongside MOTEUR_API_KEY'
            });
        }
        if (!projectId?.trim()) {
            throw new MoteurClientError({
                code: 'MOTEUR_E_CONFIG',
                message: 'MOTEUR_API_KEY is set but MOTEUR_PROJECT is missing',
                hint: 'Set MOTEUR_PROJECT to the project id when using MOTEUR_API_KEY from the environment'
            });
        }
        return {
            apiKey,
            apiUrl,
            projectId,
            source: 'environment'
        };
    }

    return await readConfigFile();
}

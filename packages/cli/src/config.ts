import path from 'path';
import fs from 'fs';
import {
    createMoteurAdminClient,
    resolveCredentials,
    type MoteurAdminClient
} from '@moteurio/client';

const CONFIG_DIR =
    process.env.MOTEUR_CONFIG_DIR ??
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? '.', '.moteur');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface CliConfig {
    apiUrl?: string;
    token?: string;
    apiKey?: string;
    projectId?: string;
}

const WEB_SESSION_MESSAGE = 'This command is not available in web session mode.';

function ensureConfigDir(): void {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    } catch {
        // ignore
    }
}

export function getConfigPath(): string {
    return CONFIG_FILE;
}

/** True when credentials come from MOTEUR_TOKEN (web Atelier). Config must not be read/written. */
export async function isWebSessionMode(): Promise<boolean> {
    try {
        const creds = await resolveCredentials();
        return creds.source === 'environment';
    } catch {
        return false;
    }
}

export async function loadConfig(): Promise<CliConfig> {
    const creds = await resolveCredentials();
    return {
        apiUrl: creds.apiUrl,
        token: creds.token,
        apiKey: creds.apiKey,
        projectId: creds.projectId ?? undefined
    };
}

export async function saveConfig(config: CliConfig): Promise<void> {
    if (await isWebSessionMode()) {
        throw new Error(WEB_SESSION_MESSAGE);
    }
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function clearConfig(): Promise<void> {
    if (await isWebSessionMode()) {
        throw new Error(WEB_SESSION_MESSAGE);
    }
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            fs.unlinkSync(CONFIG_FILE);
        }
    } catch {
        // ignore
    }
}

const defaultBaseUrl = 'http://localhost:3000';

export async function getClient(): Promise<ReturnType<typeof createMoteurAdminClient>> {
    const creds = await resolveCredentials();
    const baseURL = (creds.apiUrl || defaultBaseUrl).replace(/\/+$/, '');
    const auth = creds.token
        ? { type: 'bearer' as const, token: creds.token }
        : creds.apiKey
          ? {
                type: 'apiKey' as const,
                apiKey: creds.apiKey,
                projectId: creds.projectId ?? undefined
            }
          : undefined;
    return createMoteurAdminClient({ baseURL, auth });
}

export async function getClientOrThrow(): Promise<MoteurAdminClient> {
    const config = await loadConfig();
    if (!config.token && !config.apiKey) {
        throw new Error(
            'Not authenticated. Run `moteur auth login` or set MOTEUR_TOKEN / MOTEUR_API_KEY.'
        );
    }
    return getClient();
}

/** Resolve project ID: --project/--projectId → .moteur.json → config. */
export async function getProjectId(args?: {
    project?: string;
    projectId?: string;
}): Promise<string | undefined> {
    let projectId = (args?.project as string) ?? (args?.projectId as string);
    if (projectId !== undefined) return projectId;
    try {
        const cwd = process.cwd();
        const projectFile = path.join(cwd, '.moteur.json');
        if (fs.existsSync(projectFile)) {
            const data = JSON.parse(fs.readFileSync(projectFile, 'utf-8')) as {
                projectId?: string;
            };
            if (data.projectId) return data.projectId;
        }
    } catch {
        // ignore
    }
    const config = await loadConfig();
    return config.projectId;
}

import type { ProjectSchema } from '@moteurio/types/Project.js';
import { encryptSecret, decryptSecret } from '../webhooks/secretEncryption.js';
import { readSecretsFile, updateSecretsSection } from './secretsFile.js';

/**
 * Keeps a project's credentials (storage keys, video host tokens, the Shopify token) out of
 * project.json, because every save commits and pushes that file. Saving a project moves the
 * credentials to the encrypted secrets file. Reading the project merges them back in, so the rest
 * of the engine sees a single project object.
 */

const SECTION = 'project';

/** The fields of each video host that are secrets. Ids and account ids are not secrets. */
const VIDEO_SECRETS: Record<string, string[]> = {
    mux: ['tokenSecret', 'webhookSecret'],
    vimeo: ['accessToken', 'webhookSecret'],
    cloudflareStream: ['apiToken', 'webhookSecret'],
    youtube: ['clientSecret', 'refreshToken']
};

/** Whether a storage setting is a secret, judged by its name (keys, secrets, passwords, tokens), the same way redactAdapterConfig does. */
function isStorageSecret(key: string): boolean {
    const lower = key.toLowerCase();
    if (lower.includes('publicurl') || lower.includes('public_url')) return false;
    return ['key', 'secret', 'password', 'token'].some(word => lower.includes(word));
}

/** Lists the paths of the secrets this project holds, each as an array of property names. */
function secretPaths(project: Partial<ProjectSchema>): string[][] {
    const paths: string[][] = [];
    const adapter = project.assetConfig?.adapterConfig;
    if (adapter && typeof adapter === 'object')
        for (const key of Object.keys(adapter))
            if (isStorageSecret(key)) paths.push(['assetConfig', 'adapterConfig', key]);
    const video = project.videoProviders as Record<string, unknown> | undefined;
    if (video && typeof video === 'object')
        for (const [host, fields] of Object.entries(VIDEO_SECRETS))
            if (video[host] && typeof video[host] === 'object')
                for (const field of fields) paths.push(['videoProviders', host, field]);
    if (project.integrations?.shopify) paths.push(['integrations', 'shopify', 'accessToken']);
    return paths;
}

function at(obj: unknown, path: string[]): unknown {
    return path.reduce<unknown>(
        (o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined),
        obj
    );
}

/** Returns a copy of the project without its secrets, and the removed secrets keyed by dotted path. */
export function splitProjectSecrets<T extends Partial<ProjectSchema>>(
    project: T
): { project: T; secrets: Record<string, string> } {
    const copy = JSON.parse(JSON.stringify(project)) as T;
    const secrets: Record<string, string> = {};
    for (const path of secretPaths(project)) {
        const value = at(project, path);
        if (typeof value !== 'string' || value === '') continue;
        secrets[path.join('.')] = value;
        const parent = at(copy, path.slice(0, -1)) as Record<string, unknown>;
        delete parent[path[path.length - 1]];
    }
    return { project: copy, secrets };
}

/** Returns the project with its secrets put back. A value already in project.json wins, because it has not been moved to the secrets file yet. */
export function mergeProjectSecrets<T extends Partial<ProjectSchema>>(
    project: T,
    secrets: Record<string, string>
): T {
    const merged = JSON.parse(JSON.stringify(project)) as T;
    for (const [dotted, value] of Object.entries(secrets)) {
        const path = dotted.split('.');
        let parent = merged as Record<string, unknown>;
        let ok = true;
        for (const key of path.slice(0, -1)) {
            // Only restore a secret where its parent setting still exists.
            if (!parent[key] || typeof parent[key] !== 'object') {
                ok = false;
                break;
            }
            parent = parent[key] as Record<string, unknown>;
        }
        const field = path[path.length - 1];
        if (ok && parent[field] === undefined) parent[field] = value;
    }
    return merged;
}

/** Returns the project's decrypted secrets, keyed by dotted path. */
export function readProjectSecrets(projectDir: string): Record<string, string> {
    const stored = readSecretsFile(projectDir)[SECTION];
    if (!stored || typeof stored !== 'object') return {};
    return Object.fromEntries(
        Object.entries(stored as Record<string, string>).map(([k, v]) => [k, decryptSecret(v)])
    );
}

/** Replaces the project's stored secrets with exactly these. Any secret not listed is removed. */
export function writeProjectSecrets(projectDir: string, secrets: Record<string, string>): void {
    const sealed = Object.fromEntries(
        Object.entries(secrets).map(([k, v]) => [k, encryptSecret(v)])
    );
    updateSecretsSection(projectDir, SECTION, Object.keys(sealed).length ? sealed : undefined);
}

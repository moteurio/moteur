import crypto, { randomUUID } from 'crypto';
import type { ProjectApiKeyEntry } from '@moteurio/types/Project.js';
import { User } from '@moteurio/types/User.js';
import { getProject, getProjectById, updateProject } from './projects.js';
import { validateAllowedHostPatterns } from './apiKeyAllowedHosts.js';
import { listCollections } from './apiCollections.js';

const KEY_PREFIX = 'mk_live_';
const KEY_SECRET_LENGTH = 32;
const PREFIX_DISPLAY_LENGTH = 8;
const HASH_ALGORITHM = 'sha256';
export const MAX_PROJECT_API_KEYS = 20;

function generateRawKey(): string {
    return KEY_PREFIX + crypto.randomBytes(KEY_SECRET_LENGTH).toString('hex');
}

function hashKey(rawKey: string): string {
    return crypto.createHash(HASH_ALGORITHM).update(rawKey, 'utf8').digest('hex');
}

function toDisplayPrefix(rawKey: string): string {
    return rawKey.slice(0, PREFIX_DISPLAY_LENGTH) + '...';
}

function timingSafeEqualHash(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Resolved access rules for middleware (after matching a key). */
export type ApiKeyAccessPolicy = {
    /** null = all collections allowed */
    collectionWhitelist: string[] | null;
    /** When collectionWhitelist is set, whether sitemap/nav/radar/urls/breadcrumb are allowed */
    allowSiteWideReads: boolean;
};

export function apiKeyAccessPolicy(entry: ProjectApiKeyEntry): ApiKeyAccessPolicy {
    if (entry.allowedCollectionIds === undefined) {
        return { collectionWhitelist: null, allowSiteWideReads: true };
    }
    return {
        collectionWhitelist: [...entry.allowedCollectionIds],
        allowSiteWideReads: entry.allowSiteWideReads === true
    };
}

export type VerifyProjectApiKeyResult =
    | { ok: false }
    | {
          ok: true;
          keyId: string;
          allowedHosts?: string[];
          policy: ApiKeyAccessPolicy;
      };

/**
 * Verify x-api-key against all stored keys for the project.
 */
export async function verifyProjectApiKey(
    projectId: string,
    rawKey: string
): Promise<VerifyProjectApiKeyResult> {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) return { ok: false };
    const project = await getProjectById(projectId);
    const entries = project?.apiKeys ?? [];
    if (entries.length === 0) return { ok: false };
    const hash = hashKey(key);
    let matched: ProjectApiKeyEntry | undefined;
    for (const e of entries) {
        if (timingSafeEqualHash(hash, e.hash)) {
            matched = e;
            break;
        }
    }
    if (!matched) return { ok: false };
    const hosts = matched.allowedHosts;
    return {
        ok: true,
        keyId: matched.id,
        policy: apiKeyAccessPolicy(matched),
        ...(hosts !== undefined && hosts.length > 0 ? { allowedHosts: hosts } : {})
    };
}

export async function verifyKey(projectId: string, rawKey: string): Promise<boolean> {
    const r = await verifyProjectApiKey(projectId, rawKey);
    return r.ok;
}

export type ProjectApiKeyMeta = {
    id: string;
    prefix: string;
    createdAt: string;
    label?: string;
    allowedHosts: string[];
    allowedCollectionIds?: string[];
    allowSiteWideReads?: boolean;
};

function toMeta(e: ProjectApiKeyEntry): ProjectApiKeyMeta {
    return {
        id: e.id,
        prefix: e.prefix,
        createdAt: e.createdAt,
        ...(e.label !== undefined ? { label: e.label } : {}),
        allowedHosts: e.allowedHosts ?? [],
        ...(e.allowedCollectionIds !== undefined
            ? { allowedCollectionIds: e.allowedCollectionIds }
            : {}),
        ...(e.allowSiteWideReads !== undefined ? { allowSiteWideReads: e.allowSiteWideReads } : {})
    };
}

export async function listProjectApiKeyMeta(
    projectId: string,
    user: User
): Promise<ProjectApiKeyMeta[]> {
    const project = await getProject(user, projectId);
    return (project.apiKeys ?? []).map(toMeta);
}

async function assertCollectionIdsExist(projectId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const collections = await listCollections(projectId);
    const known = new Set(collections.map(c => c.id));
    const missing = ids.filter(id => !known.has(id));
    if (missing.length > 0) {
        throw new Error(`Unknown collection id(s): ${missing.join(', ')}`);
    }
}

export type CreateProjectApiKeyInput = {
    label?: string;
    allowedCollectionIds?: string[];
    allowSiteWideReads?: boolean;
};

/**
 * Create a new API key. Returns raw secret once.
 */
export async function createKey(
    projectId: string,
    user: User,
    input: CreateProjectApiKeyInput = {}
): Promise<{ rawKey: string; prefix: string; meta: ProjectApiKeyMeta }> {
    const project = await getProject(user, projectId);
    const keys = [...(project.apiKeys ?? [])];
    if (keys.length >= MAX_PROJECT_API_KEYS) {
        throw new Error(`At most ${MAX_PROJECT_API_KEYS} API keys per project`);
    }
    if (input.allowedCollectionIds !== undefined) {
        await assertCollectionIdsExist(projectId, input.allowedCollectionIds);
    }
    const rawKey = generateRawKey();
    const hash = hashKey(rawKey);
    const prefix = toDisplayPrefix(rawKey);
    const now = new Date().toISOString();
    const id = randomUUID();
    const entry: ProjectApiKeyEntry = {
        id,
        hash,
        prefix,
        createdAt: now,
        ...(input.label !== undefined && input.label !== '' ? { label: input.label.trim() } : {}),
        ...(input.allowedCollectionIds !== undefined
            ? {
                  allowedCollectionIds: [...input.allowedCollectionIds],
                  ...(input.allowSiteWideReads !== undefined
                      ? { allowSiteWideReads: input.allowSiteWideReads }
                      : {})
              }
            : {})
    };
    keys.push(entry);
    await updateProject(user, projectId, { apiKeys: keys });
    return { rawKey, prefix, meta: toMeta(entry) };
}

/**
 * Rotate one key; preserves restriction fields unless overridden later.
 */
export async function rotateKey(
    projectId: string,
    user: User,
    keyId: string
): Promise<{ rawKey: string; prefix: string; meta: ProjectApiKeyMeta }> {
    const project = await getProject(user, projectId);
    const keys = project.apiKeys ?? [];
    const idx = keys.findIndex(k => k.id === keyId);
    if (idx < 0) throw new Error('API key not found');
    const prev = keys[idx]!;
    const rawKey = generateRawKey();
    const hash = hashKey(rawKey);
    const prefix = toDisplayPrefix(rawKey);
    const now = new Date().toISOString();
    const next: ProjectApiKeyEntry = {
        id: prev.id,
        hash,
        prefix,
        createdAt: now,
        ...(prev.label !== undefined ? { label: prev.label } : {}),
        ...(prev.allowedHosts !== undefined ? { allowedHosts: [...prev.allowedHosts] } : {}),
        ...(prev.allowedCollectionIds !== undefined
            ? { allowedCollectionIds: [...prev.allowedCollectionIds] }
            : {}),
        ...(prev.allowSiteWideReads !== undefined
            ? { allowSiteWideReads: prev.allowSiteWideReads }
            : {})
    };
    const copy = [...keys];
    copy[idx] = next;
    await updateProject(user, projectId, { apiKeys: copy });
    return { rawKey, prefix, meta: toMeta(next) };
}

export async function revokeKey(projectId: string, user: User, keyId: string): Promise<void> {
    const project = await getProject(user, projectId);
    const keys = project.apiKeys ?? [];
    const next = keys.filter(k => k.id !== keyId);
    if (next.length === keys.length) throw new Error('API key not found');
    await updateProject(user, projectId, {
        apiKeys: next.length > 0 ? next : null
    } as Parameters<typeof updateProject>[2]);
}

export type PatchProjectApiKeyInput = {
    label?: string | null;
    allowedHosts?: unknown;
    allowedCollectionIds?: string[] | null;
    allowSiteWideReads?: boolean;
};

/**
 * Update metadata / restrictions for one key (not the secret).
 */
export async function patchKey(
    projectId: string,
    user: User,
    keyId: string,
    patch: PatchProjectApiKeyInput
): Promise<ProjectApiKeyMeta> {
    const project = await getProject(user, projectId);
    const keys = [...(project.apiKeys ?? [])];
    const idx = keys.findIndex(k => k.id === keyId);
    if (idx < 0) throw new Error('API key not found');
    const cur = keys[idx]!;
    let next: ProjectApiKeyEntry = { ...cur };

    if (patch.label !== undefined) {
        if (patch.label === null || patch.label === '') {
            next = { ...next };
            delete next.label;
        } else {
            next = { ...next, label: patch.label.trim() };
        }
    }

    if (patch.allowedHosts !== undefined) {
        const allowedHosts = validateAllowedHostPatterns(patch.allowedHosts);
        next = { ...next, allowedHosts };
    }

    if (patch.allowedCollectionIds !== undefined) {
        if (patch.allowedCollectionIds === null) {
            next = { ...next };
            delete next.allowedCollectionIds;
            delete next.allowSiteWideReads;
        } else {
            await assertCollectionIdsExist(projectId, patch.allowedCollectionIds);
            next = {
                ...next,
                allowedCollectionIds: [...patch.allowedCollectionIds]
            };
        }
    }

    if (patch.allowSiteWideReads !== undefined) {
        next = { ...next, allowSiteWideReads: patch.allowSiteWideReads };
    }

    keys[idx] = next;
    await updateProject(user, projectId, { apiKeys: keys });
    return toMeta(next);
}

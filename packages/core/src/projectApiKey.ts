import crypto from 'crypto';
import { User } from '@moteurio/types/User.js';
import { getProject, getProjectById, updateProject } from './projects.js';

const KEY_PREFIX = 'mk_live_';
const KEY_SECRET_LENGTH = 32; // 32 bytes = 64 hex chars
const PREFIX_DISPLAY_LENGTH = 8; // "mk_live_" is 8 chars
const HASH_ALGORITHM = 'sha256';

function generateRawKey(): string {
    return KEY_PREFIX + crypto.randomBytes(KEY_SECRET_LENGTH).toString('hex');
}

function hashKey(rawKey: string): string {
    return crypto.createHash(HASH_ALGORITHM).update(rawKey, 'utf8').digest('hex');
}

function toDisplayPrefix(rawKey: string): string {
    return rawKey.slice(0, PREFIX_DISPLAY_LENGTH) + '...';
}

/**
 * Generate a new project API key. Stores hash + prefix in project.json.
 * Returns the raw key ONCE — never stored in plaintext.
 */
export async function generateKey(
    projectId: string,
    user: User
): Promise<{ rawKey: string; prefix: string }> {
    const project = await getProject(user, projectId);
    if (project.apiKey) {
        throw new Error('Project already has an API key. Use rotate to replace it.');
    }
    const rawKey = generateRawKey();
    const hash = hashKey(rawKey);
    const prefix = toDisplayPrefix(rawKey);
    const now = new Date().toISOString();
    await updateProject(user, projectId, {
        apiKey: { hash, prefix, createdAt: now }
    });
    return { rawKey, prefix };
}

/**
 * Replace existing key with a new one. Returns new raw key ONCE.
 */
export async function rotateKey(
    projectId: string,
    user: User
): Promise<{ rawKey: string; prefix: string }> {
    await getProject(user, projectId);
    const rawKey = generateRawKey();
    const hash = hashKey(rawKey);
    const prefix = toDisplayPrefix(rawKey);
    const now = new Date().toISOString();
    await updateProject(user, projectId, {
        apiKey: { hash, prefix, createdAt: now }
    });
    return { rawKey, prefix };
}

/**
 * Remove API key from project entirely.
 */
export async function revokeKey(projectId: string, user: User): Promise<void> {
    const project = await getProject(user, projectId);
    if (!project.apiKey) return;
    await updateProject(user, projectId, { apiKey: undefined });
}

/**
 * Verify incoming raw key against stored hash. Uses timing-safe comparison.
 */
export async function verifyKey(projectId: string, rawKey: string): Promise<boolean> {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) return false;
    const project = await getProjectById(projectId);
    if (!project?.apiKey?.hash) return false;
    const hash = hashKey(key);
    if (hash.length !== project.apiKey.hash.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(project.apiKey.hash, 'hex')
    );
}

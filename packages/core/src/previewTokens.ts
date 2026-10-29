import crypto, { randomUUID } from 'crypto';
import type {
    PreviewTokenCreateInput,
    PreviewTokenCreateResult,
    PreviewTokenEntry,
    PreviewTokenMeta
} from '@moteurio/types/PreviewToken.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from './projects.js';
import { assertCanEdit } from './contentAccess.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';

const TOKEN_PREFIX = 'mpv_';
const SECRET_BYTES = 24;
const DISPLAY_PREFIX_LEN = 10;
const DEFAULT_TTL_SEC = 1800;
const MAX_TTL_SEC = 3600;
const STORAGE_KEY = 'preview-tokens';
/**
 * Live links each person may have at once, and a project in all. Past the first, the person's
 * own oldest link ends, never someone else's (a link a colleague sent a client keeps working).
 */
const MAX_ACTIVE_PER_PERSON = 50;
const MAX_ACTIVE_TOKENS = 500;

function hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function timingSafeEqualHash(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function toMeta(entry: PreviewTokenEntry): PreviewTokenMeta {
    return {
        id: entry.id,
        prefix: entry.prefix,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        ...(entry.entryId ? { modelId: entry.modelId, entryId: entry.entryId } : {}),
        ...(entry.pageId ? { pageId: entry.pageId } : {}),
        ...(entry.channelId ? { channelId: entry.channelId } : {})
    };
}

async function loadTokens(projectId: string): Promise<PreviewTokenEntry[]> {
    return (await getProjectJson<PreviewTokenEntry[]>(projectId, STORAGE_KEY)) ?? [];
}

async function saveTokens(projectId: string, list: PreviewTokenEntry[]): Promise<void> {
    await putProjectJson(projectId, STORAGE_KEY, list);
}

function pruneExpired(list: PreviewTokenEntry[], now = Date.now()): PreviewTokenEntry[] {
    return list.filter(e => Date.parse(e.expiresAt) > now);
}

export type VerifyPreviewTokenResult =
    | { ok: false }
    | {
          ok: true;
          tokenId: string;
          modelId?: string;
          entryId?: string;
          pageId?: string;
          channelId?: string;
      };

export async function verifyPreviewToken(
    projectId: string,
    rawToken: string
): Promise<VerifyPreviewTokenResult> {
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!token.startsWith(TOKEN_PREFIX)) return { ok: false };
    const list = pruneExpired(await loadTokens(projectId));
    const hash = hashToken(token);
    const matched = list.find(e => timingSafeEqualHash(hash, e.hash));
    if (!matched) return { ok: false };
    if (Date.parse(matched.expiresAt) <= Date.now()) return { ok: false };
    return {
        ok: true,
        tokenId: matched.id,
        ...(matched.entryId ? { modelId: matched.modelId, entryId: matched.entryId } : {}),
        ...(matched.pageId ? { pageId: matched.pageId } : {}),
        ...(matched.channelId ? { channelId: matched.channelId } : {})
    };
}

export async function createPreviewToken(
    projectId: string,
    user: User,
    input: PreviewTokenCreateInput = {}
): Promise<PreviewTokenCreateResult> {
    // A preview link shows drafts: for the people who write them.
    assertCanEdit(user);
    if (input.entryId && !input.modelId)
        throw Object.assign(new Error('A preview link for an entry needs its model (modelId).'), {
            status: 400
        });
    await getProject(user, projectId);
    const ttl = Math.min(MAX_TTL_SEC, Math.max(60, input.ttlSeconds ?? DEFAULT_TTL_SEC));
    const now = Date.now();
    const expiresAt = new Date(now + ttl * 1000).toISOString();
    const rawToken = TOKEN_PREFIX + crypto.randomBytes(SECRET_BYTES).toString('hex');
    const entry: PreviewTokenEntry = {
        id: randomUUID(),
        hash: hashToken(rawToken),
        prefix: rawToken.slice(0, DISPLAY_PREFIX_LEN) + '...',
        createdAt: new Date(now).toISOString(),
        expiresAt,
        createdBy: user.id,
        ...(input.entryId ? { modelId: input.modelId, entryId: input.entryId } : {}),
        ...(input.pageId ? { pageId: input.pageId } : {}),
        ...(input.channelId ? { channelId: input.channelId } : {})
    };
    let list = pruneExpired(await loadTokens(projectId));
    const mine = list.filter(t => t.createdBy === user.id);
    if (mine.length >= MAX_ACTIVE_PER_PERSON) {
        const ending = new Set(mine.slice(0, mine.length - MAX_ACTIVE_PER_PERSON + 1));
        list = list.filter(t => !ending.has(t));
    }
    if (list.length >= MAX_ACTIVE_TOKENS) list = list.slice(-(MAX_ACTIVE_TOKENS - 1));
    list.push(entry);
    await saveTokens(projectId, list);
    return { rawToken, token: toMeta(entry) };
}

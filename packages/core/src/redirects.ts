import { randomUUID } from 'crypto';
import type { Redirect, RedirectStatus } from '@moteurio/types/Redirect.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from './projects.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { assertCanWrite } from './contentAccess.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { REDIRECTS_KEY } from './utils/storageKeys.js';
import { triggerEvent, onEvent } from './utils/eventBus.js';
import { isValidId } from './utils/idUtils.js';
import { resolveAllUrls, resolveEntryUrls } from './pages.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';

/** More than any site needs; it keeps the file a frontend downloads small. */
const MAX_REDIRECTS = 5000;

export type RedirectInput = {
    from: string;
    to: string;
    status?: RedirectStatus;
    note?: string;
};

function refuse(message: string, statusCode = 400): Error {
    const err = new Error(message) as Error & { statusCode: number };
    err.statusCode = statusCode;
    return err;
}

/**
 * A site path as Moteur compares them: one leading slash, no repeated or trailing slash, no
 * query or fragment. Null when it isn't a path.
 */
export function normalizePath(raw: string): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
    if (/[?#\s]/.test(trimmed)) return null;
    const collapsed = trimmed.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    return collapsed || '/';
}

/** Where a redirect may point: a site path, or a full http(s) address. */
function normalizeTarget(raw: string): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (/^https?:\/\/[^\s]+$/i.test(trimmed)) {
        try {
            return new URL(trimmed).toString();
        } catch {
            return null;
        }
    }
    if (/\s/.test(trimmed) || !trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
    const [path, rest] = trimmed.split(/(?=[?#])/, 2);
    const clean = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
    return rest ? clean + rest : clean;
}

function assertStatus(status: unknown): RedirectStatus {
    if (status === undefined) return 301;
    if (status === 301 || status === 302) return status;
    throw refuse('A redirect is permanent (301) or temporary (302).');
}

async function loadRedirects(projectId: string): Promise<Redirect[]> {
    return (await getProjectJson<Redirect[]>(projectId, REDIRECTS_KEY)) ?? [];
}

async function saveRedirects(
    projectId: string,
    list: Redirect[],
    message: string,
    user: User
): Promise<void> {
    await putProjectJson(projectId, REDIRECTS_KEY, list);
    triggerEvent('content.saved', { projectId, paths: [REDIRECTS_KEY], message, user });
    // Hosts often apply redirects at build time: a deploy hook rebuilds.
    try {
        await webhookDispatch(
            'redirects.updated',
            { count: list.length, updatedBy: user.id },
            { projectId, source: 'api' }
        );
    } catch {
        // never fail the operation
    }
}

export async function listRedirects(projectId: string): Promise<Redirect[]> {
    if (!isValidId(projectId)) throw new Error(`Invalid projectId: "${projectId}"`);
    return loadRedirects(projectId);
}

/** The redirect from this path, if there is one. */
export async function findRedirect(projectId: string, path: string): Promise<Redirect | null> {
    const from = normalizePath(path);
    if (from === null) return null;
    return (await loadRedirects(projectId)).find(r => r.from === from) ?? null;
}

/**
 * Check one redirect against the others and point it at the end of any chain: a → b with
 * b → c already there becomes a → c. Refuses a loop and an address something already uses.
 */
async function checked(
    projectId: string,
    list: Redirect[],
    input: RedirectInput,
    excludeId?: string
): Promise<{ from: string; to: string; status: RedirectStatus; note?: string }> {
    const from = normalizePath(input.from);
    if (from === null)
        throw refuse('"From" must be a path on the site, starting with / (no query or #).');
    let to = normalizeTarget(input.to);
    if (to === null) throw refuse('"To" must be a path starting with /, or an http(s) address.');
    const status = assertStatus(input.status);

    const others = list.filter(r => r.id !== excludeId);
    if (others.some(r => r.from === from))
        throw refuse(`There is already a redirect from ${from}.`, 409);
    const live = await resolveAllUrls(projectId);
    if (live.some(u => u.url === from))
        throw refuse(
            `A live page is at ${from}. Change that page's address instead; Moteur redirects it for you.`,
            409
        );

    if (to === from) throw refuse('A redirect cannot point to its own address.');
    const seen = new Set([from]);
    for (let hop = others.find(r => r.from === to); hop; hop = others.find(r => r.from === to)) {
        seen.add(to);
        to = hop.to;
        if (seen.has(to)) throw refuse(`This redirect would loop back to ${to}.`);
    }
    const note =
        typeof input.note === 'string' && input.note.trim() ? input.note.trim() : undefined;
    return { from, to, status, ...(note && { note }) };
}

/** Redirects that pointed at `from` now point where it goes. */
function retarget(list: Redirect[], from: string, to: string, now: string): void {
    for (const r of list)
        if (r.to === from && r.from !== to) Object.assign(r, { to, updatedAt: now });
}

async function assertCanManage(user: User, projectId: string): Promise<void> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);
    assertCanWrite(user);
}

export async function createRedirect(
    projectId: string,
    user: User,
    input: RedirectInput
): Promise<Redirect> {
    await assertCanManage(user, projectId);
    const list = await loadRedirects(projectId);
    if (list.length >= MAX_REDIRECTS)
        throw refuse(`A project keeps up to ${MAX_REDIRECTS} redirects.`, 409);
    const fields = await checked(projectId, list, input ?? ({} as RedirectInput));
    const now = new Date().toISOString();
    const redirect: Redirect = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
    retarget(list, redirect.from, redirect.to, now);
    list.push(redirect);
    await saveRedirects(
        projectId,
        list,
        `Redirect ${redirect.from} → ${redirect.to} — ${user.name ?? user.id}`,
        user
    );
    return redirect;
}

export async function updateRedirect(
    projectId: string,
    user: User,
    id: string,
    patch: Partial<RedirectInput>
): Promise<Redirect> {
    await assertCanManage(user, projectId);
    const list = await loadRedirects(projectId);
    const current = list.find(r => r.id === id);
    if (!current) throw new Error(`Redirect "${id}" not found.`);
    const fields = await checked(projectId, list, { ...current, ...patch }, id);
    const now = new Date().toISOString();
    const updated: Redirect = { ...current, ...fields, updatedAt: now };
    if (!fields.note) delete updated.note;
    // Edited by a person: no longer Moteur's own.
    delete updated.auto;
    const next = list.map(r => (r.id === id ? updated : r));
    retarget(next, updated.from, updated.to, now);
    await saveRedirects(
        projectId,
        next,
        `Update redirect ${updated.from} → ${updated.to} — ${user.name ?? user.id}`,
        user
    );
    return updated;
}

export async function deleteRedirect(projectId: string, user: User, id: string): Promise<void> {
    await assertCanManage(user, projectId);
    const list = await loadRedirects(projectId);
    const current = list.find(r => r.id === id);
    if (!current) throw new Error(`Redirect "${id}" not found.`);
    await saveRedirects(
        projectId,
        list.filter(r => r.id !== id),
        `Delete redirect ${current.from} — ${user.name ?? user.id}`,
        user
    );
}

/**
 * Live addresses that changed: each old one redirects (301) to the new. A redirect from an
 * address that is live again goes, and redirects to an old address follow it to the new one.
 */
export async function recordMovedAddresses(
    projectId: string,
    user: User,
    moves: { from: string; to: string }[]
): Promise<void> {
    const list = await loadRedirects(projectId);
    const now = new Date().toISOString();
    let changed = false;
    for (const move of moves) {
        const from = normalizePath(move.from);
        const to = normalizePath(move.to);
        if (from === null || to === null || from === to) continue;
        // The new address is live: nothing redirects away from it any more.
        const stale = list.findIndex(r => r.from === to);
        if (stale >= 0) list.splice(stale, 1);
        retarget(list, from, to, now);
        const existing = list.find(r => r.from === from);
        if (existing) Object.assign(existing, { to, status: 301, auto: true, updatedAt: now });
        else
            list.push({
                id: randomUUID(),
                from,
                to,
                status: 301,
                auto: true,
                createdAt: now,
                updatedAt: now
            });
        changed = true;
    }
    if (!changed) return;
    await saveRedirects(
        projectId,
        list,
        `Redirect ${moves.length === 1 ? moves[0].from : `${moves.length} moved addresses`} — ${user.name ?? user.id}`,
        user
    );
}

/** Entries' live addresses before a save, by project, model and entry. */
const entryAddressesBefore = new Map<string, Record<string, string>>();

/**
 * When an entry is published with a new slug, its old address redirects to the new one. The
 * address is read before and after each save; drafts don't change it, so they cost a lookup.
 */
export function registerRedirectHooks(): void {
    const key = (p: { projectId: string; modelId: string; entry: { id: string } }) =>
        `${p.projectId}|${p.modelId}|${p.entry.id}`;
    onEvent('entry.beforeUpdate', async payload => {
        try {
            const urls = await resolveEntryUrls(
                payload.projectId,
                payload.entry.id,
                payload.modelId
            );
            if (Object.keys(urls).length) entryAddressesBefore.set(key(payload), urls);
        } catch {
            // never block a save
        }
    });
    onEvent('entry.afterUpdate', async payload => {
        const before = entryAddressesBefore.get(key(payload));
        if (!before) return;
        entryAddressesBefore.delete(key(payload));
        const after = await resolveEntryUrls(payload.projectId, payload.entry.id, payload.modelId);
        const moves = Object.entries(before)
            .filter(([locale, url]) => after[locale] && after[locale] !== url)
            .map(([locale, url]) => ({ from: url, to: after[locale] }));
        if (moves.length) await recordMovedAddresses(payload.projectId, payload.user, moves);
    });
}

import fs from 'fs';
import path from 'path';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { normalizeStoredRoles, ROLE_SLUGS } from '@moteurio/types';
import { storageConfig } from './config/storageConfig.js';
import { writeJsonAtomic } from './utils/fileUtils.js';

/**
 * Invitations to join a project, kept in `invites.json` next to the users file. Only a hash of
 * each link's token is stored; the token itself is shown once, when the invite is made or renewed.
 */
export type ProjectInvite = {
    id: string;
    projectId: string;
    /** Lowercased. Only someone with this address can accept. */
    email: string;
    roles: string[];
    invitedBy: string;
    /** A few words from the person who invited, shown in the email. Plain text. */
    note?: string;
    createdAt: string;
    expiresAt: string;
    tokenHash: string;
};

export const INVITE_TTL_DAYS = 7;
export const INVITE_NOTE_MAX = 500;

/**
 * An inviter's note as it is kept: plain text, line breaks kept (at most one blank line in a
 * row), other control characters dropped. Empty means none. Throws a 400 when it can't be used.
 */
export function cleanInviteNote(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== 'string')
        throw Object.assign(new Error('note must be text'), { status: 400 });
    const note = raw
        .replace(/\r\n?/g, '\n')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if ([...note].length > INVITE_NOTE_MAX)
        throw Object.assign(new Error(`note is longer than ${INVITE_NOTE_MAX} characters`), {
            status: 400
        });
    return note || undefined;
}

function invitesFile(): string {
    return path.join(path.dirname(storageConfig.usersFile), 'invites.json');
}

function readAll(): ProjectInvite[] {
    try {
        const raw = JSON.parse(fs.readFileSync(invitesFile(), 'utf-8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeAll(invites: ProjectInvite[]): void {
    const now = Date.now();
    writeJsonAtomic(
        invitesFile(),
        invites.filter(i => Date.parse(i.expiresAt) > now)
    );
}

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function isLive(invite: ProjectInvite): boolean {
    return Date.parse(invite.expiresAt) > Date.now();
}

function fresh(): { token: string; tokenHash: string; createdAt: string; expiresAt: string } {
    const token = randomBytes(24).toString('base64url');
    const now = Date.now();
    return {
        token,
        tokenHash: hashToken(token),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    };
}

/** Whether someone was invited to a project at this address, and the invite is still good. */
export function hasLiveInvite(email: string): boolean {
    const wanted = normalizeInviteEmail(email);
    return readAll().some(i => isLive(i) && i.email === wanted);
}

export function normalizeInviteEmail(email: string): string {
    return email.trim().toLowerCase();
}

/** The newest live invite for an address, from any project. */
export function liveInviteFor(email: string): ProjectInvite | undefined {
    const wanted = normalizeInviteEmail(email);
    return readAll()
        .filter(i => isLive(i) && i.email === wanted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Pending invites to a project, oldest first. */
export function listInvites(projectId: string): ProjectInvite[] {
    return readAll().filter(i => i.projectId === projectId && isLive(i));
}

/** Invite someone; a pending invite for the same address is replaced (its link stops working). */
export function createInvite(input: {
    projectId: string;
    email: string;
    roles: string[];
    invitedBy: string;
    note?: string;
}): { invite: ProjectInvite; token: string } {
    const email = normalizeInviteEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required');
    const { token, ...times } = fresh();
    const invite: ProjectInvite = {
        id: `invite:${randomUUID()}`,
        projectId: input.projectId,
        email,
        roles: normalizeStoredRoles(
            input.roles.filter(r => (ROLE_SLUGS as readonly string[]).includes(r))
        ),
        invitedBy: input.invitedBy,
        ...(input.note && { note: input.note }),
        ...times
    };
    writeAll([
        ...readAll().filter(i => !(i.projectId === input.projectId && i.email === email)),
        invite
    ]);
    return { invite, token };
}

/** A new link (and a new week) for a pending invite; the old link stops working. */
export function renewInvite(
    projectId: string,
    inviteId: string
): { invite: ProjectInvite; token: string } | null {
    const all = readAll();
    const index = all.findIndex(i => i.id === inviteId && i.projectId === projectId && isLive(i));
    if (index === -1) return null;
    const { token, ...times } = fresh();
    const invite = { ...all[index], ...times };
    all[index] = invite;
    writeAll(all);
    return { invite, token };
}

/** Withdraw an invite. False when there was none. */
export function revokeInvite(projectId: string, inviteId: string): boolean {
    const all = readAll();
    const next = all.filter(i => !(i.id === inviteId && i.projectId === projectId));
    if (next.length === all.length) return false;
    writeAll(next);
    return true;
}

/** The pending invite behind a link, or null when it is unknown, used or expired. */
export function findInviteByToken(token: string): ProjectInvite | null {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
    const hash = hashToken(token);
    return readAll().find(i => i.tokenHash === hash && isLive(i)) ?? null;
}

/** Once accepted, an invite is gone. */
export function consumeInvite(inviteId: string): void {
    const all = readAll();
    const next = all.filter(i => i.id !== inviteId);
    if (next.length !== all.length) writeAll(next);
}

/** Withdraw every pending invite someone sent (their account is going). How many went. */
export function withdrawInvitesBy(userId: string): number {
    const all = readAll();
    const next = all.filter(i => i.invitedBy !== userId);
    if (next.length !== all.length) writeAll(next);
    return all.length - next.length;
}

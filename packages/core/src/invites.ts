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
    createdAt: string;
    expiresAt: string;
    tokenHash: string;
};

export const INVITE_TTL_DAYS = 7;

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

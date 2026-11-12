import fs from 'fs';
import path from 'path';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { normalizeStoredRoles, ROLE_SLUGS } from '@moteurio/types';
import { storageConfig } from './config/storageConfig.js';
import { writeJsonAtomic } from './utils/fileUtils.js';
import type { MemberInput } from './workspaces.js';

/**
 * Invitations to join a project or a workspace, stored in `invites.json` next to the users file.
 * Only a hash of each invite token is stored. The token itself is returned once, when the invite
 * is created or renewed. Both kinds use the same link format (`/invite/<token>`), and the
 * `workspaceId` field tells them apart.
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

/** An invitation to join a workspace's team, with the place they will have in it. */
export type WorkspaceInvite = Omit<ProjectInvite, 'projectId' | 'roles'> & {
    workspaceId: string;
    member: MemberInput;
};

export type Invite = ProjectInvite | WorkspaceInvite;

export function isWorkspaceInvite(invite: Invite): invite is WorkspaceInvite {
    return 'workspaceId' in invite && typeof invite.workspaceId === 'string';
}

/** Where an invite is to: one project, or one workspace. */
type Scope = { projectId: string } | { workspaceId: string };

function inScope(invite: Invite, scope: Scope): boolean {
    return 'projectId' in scope
        ? !isWorkspaceInvite(invite) && invite.projectId === scope.projectId
        : isWorkspaceInvite(invite) && invite.workspaceId === scope.workspaceId;
}

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

function readAll(): Invite[] {
    try {
        const raw = JSON.parse(fs.readFileSync(invitesFile(), 'utf-8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function writeAll(invites: Invite[]): void {
    const now = Date.now();
    writeJsonAtomic(
        invitesFile(),
        invites.filter(i => Date.parse(i.expiresAt) > now)
    );
}

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function isLive(invite: Invite): boolean {
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

/** The newest live invite to a project for an address, from any project. */
export function liveInviteFor(email: string): ProjectInvite | undefined {
    const wanted = normalizeInviteEmail(email);
    return readAll()
        .filter((i): i is ProjectInvite => !isWorkspaceInvite(i) && isLive(i) && i.email === wanted)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Pending invites to a project, oldest first. */
export function listInvites(projectId: string): ProjectInvite[] {
    return readAll().filter((i): i is ProjectInvite => inScope(i, { projectId }) && isLive(i));
}

/** Pending invites to a workspace, oldest first. */
export function listWorkspaceInvites(workspaceId: string): WorkspaceInvite[] {
    return readAll().filter((i): i is WorkspaceInvite => inScope(i, { workspaceId }) && isLive(i));
}

function checkedEmail(raw: string): string {
    const email = normalizeInviteEmail(raw);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required');
    return email;
}

/** Invite someone; a pending invite for the same address is replaced (its link stops working). */
export function createInvite(input: {
    projectId: string;
    email: string;
    roles: string[];
    invitedBy: string;
    note?: string;
}): { invite: ProjectInvite; token: string } {
    const email = checkedEmail(input.email);
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
    writeAll([...readAll().filter(i => !(inScope(i, input) && i.email === email)), invite]);
    return { invite, token };
}

/**
 * Invite someone into a workspace's team, with the place they will have (checked by the caller,
 * see `addWorkspaceMember`); a pending invite for the same address is replaced.
 */
export function createWorkspaceInvite(input: {
    workspaceId: string;
    email: string;
    member: MemberInput;
    invitedBy: string;
    note?: string;
}): { invite: WorkspaceInvite; token: string } {
    const email = checkedEmail(input.email);
    const { token, ...times } = fresh();
    const invite: WorkspaceInvite = {
        id: `invite:${randomUUID()}`,
        workspaceId: input.workspaceId,
        email,
        member: input.member,
        invitedBy: input.invitedBy,
        ...(input.note && { note: input.note }),
        ...times
    };
    writeAll([...readAll().filter(i => !(inScope(i, input) && i.email === email)), invite]);
    return { invite, token };
}

function renew<T extends Invite>(
    scope: Scope,
    inviteId: string
): { invite: T; token: string } | null {
    const all = readAll();
    const index = all.findIndex(i => i.id === inviteId && inScope(i, scope) && isLive(i));
    if (index === -1) return null;
    const { token, ...times } = fresh();
    const invite = { ...all[index]!, ...times } as T;
    all[index] = invite;
    writeAll(all);
    return { invite, token };
}

/** A new link (and a new week) for a pending invite; the old link stops working. */
export function renewInvite(projectId: string, inviteId: string) {
    return renew<ProjectInvite>({ projectId }, inviteId);
}

/** A new link (and a new week) for a pending workspace invite. */
export function renewWorkspaceInvite(workspaceId: string, inviteId: string) {
    return renew<WorkspaceInvite>({ workspaceId }, inviteId);
}

/** Withdraw an invite to a project. False when there was none. */
export function revokeInvite(projectId: string, inviteId: string): boolean {
    return revoke({ projectId }, inviteId);
}

/** Withdraw an invite to a workspace. False when there was none. */
export function revokeWorkspaceInvite(workspaceId: string, inviteId: string): boolean {
    return revoke({ workspaceId }, inviteId);
}

/** Withdraws every pending invite to a workspace, used when the workspace is deleted. */
export function withdrawWorkspaceInvites(workspaceId: string): void {
    const all = readAll();
    const next = all.filter(i => !inScope(i, { workspaceId }));
    if (next.length !== all.length) writeAll(next);
}

function revoke(scope: Scope, inviteId: string): boolean {
    const all = readAll();
    const next = all.filter(i => !(i.id === inviteId && inScope(i, scope)));
    if (next.length === all.length) return false;
    writeAll(next);
    return true;
}

/** The pending invite behind a link, or null when it is unknown, used or expired. */
export function findInviteByToken(token: string): Invite | null {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
    const hash = hashToken(token);
    return readAll().find(i => i.tokenHash === hash && isLive(i)) ?? null;
}

/** Deletes an invite after it is accepted. */
export function consumeInvite(inviteId: string): void {
    const all = readAll();
    const next = all.filter(i => i.id !== inviteId);
    if (next.length !== all.length) writeAll(next);
}

/** Withdraws every pending invite a user sent, used when their account is deleted. Returns how many were withdrawn. */
export function withdrawInvitesBy(userId: string): number {
    const all = readAll();
    const next = all.filter(i => i.invitedBy !== userId);
    if (next.length !== all.length) writeAll(next);
    return all.length - next.length;
}

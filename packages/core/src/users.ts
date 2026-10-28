import { revokeAuthSession } from './authSessions.js';
import { withWriteLock } from './utils/projectWriteLock.js';
import fs from 'fs';
import { inProject, normalizeStoredRoles } from '@moteurio/types';
import { User } from '@moteurio/types/User.js';
import { storageConfig } from './config/storageConfig.js';
import { writePrivateState } from './utils/privateStore.js';
import { triggerEvent } from './utils/eventBus.js';
import { isSystemActor } from './utils/systemActor.js';

function getUsersFilePath(): string {
    return storageConfig.usersFile;
}

/**
 * In-memory cache of users. Invalidated on write in this process.
 * Concurrency: users.json is written atomically (temp file + rename).
 * Multiple processes (e.g. API + CLI) should not write concurrently to the same file;
 * prefer a single writer or move to a proper database for multi-instance deployments.
 */
let cachedUsers: User[] | null = null;

export function getCachedUsers(): User[] {
    if (!cachedUsers) {
        const usersFile = getUsersFilePath();
        if (!fs.existsSync(usersFile)) {
            return [];
        }
        const data = fs.readFileSync(usersFile, 'utf-8');
        cachedUsers = JSON.parse(data);
    }
    return cachedUsers ?? [];
}

export function listUsers(): User[] {
    return getCachedUsers();
}

/** Addresses are compared without case: Alice@Corp.com and alice@corp.com are one person. */
export function getUserByEmail(email: string): User | undefined {
    const wanted = email.trim().toLowerCase();
    return getCachedUsers().find(u => u.email?.toLowerCase() === wanted);
}

export function getUserById(id: string): User | undefined {
    return getCachedUsers().find(u => u.id === id);
}

/** Attach an authenticated provider only after the API proves a recent personal sign-in. */
export async function linkUserProvider(
    userId: string,
    identity: Record<string, string | number>
): Promise<User> {
    return withWriteLock(getUsersFilePath(), () => linkUserProviderUnlocked(userId, identity));
}

async function linkUserProviderUnlocked(
    userId: string,
    identity: Record<string, string | number>
): Promise<User> {
    reloadUsers();
    const users = getCachedUsers();
    const index = users.findIndex(user => user.id === userId && user.isActive);
    if (index < 0) throw new Error('User not found');
    const pairs = Object.entries(identity);
    if (!pairs.length || pairs.some(([, value]) => !String(value).trim()))
        throw new Error('Provider identity required');
    if (
        users.some(
            user => user.id !== userId && pairs.every(([key, value]) => user.auth?.[key] === value)
        )
    ) {
        throw Object.assign(new Error('This provider is already connected to another account'), {
            status: 409
        });
    }
    const current = users[index];
    if (pairs.some(([key, value]) => current.auth?.[key] != null && current.auth[key] !== value)) {
        throw Object.assign(
            new Error('A different identity for this provider is already connected'),
            { status: 409 }
        );
    }
    const updated: User = {
        ...current,
        auth: { ...current.auth, ...identity },
        authVersion: (current.authVersion ?? 0) + 1
    };
    await triggerEvent('user.beforeUpdate', { user: updated, performedBy: current });
    const fresh = getCachedUsers().slice();
    fresh[index] = updated;
    writePrivateState(getUsersFilePath(), fresh);
    cachedUsers = null;
    revokeAuthSession(userId);
    await triggerEvent('user.afterUpdate', { user: updated, performedBy: current });
    return updated;
}

/** Members of a project. Pass the project to get each member with their roles in it. */
export function getProjectUsers(
    projectId: string,
    project?: { memberRoles?: Record<string, readonly string[]> }
): User[] {
    const members = getCachedUsers().filter(user => user.projects?.includes(projectId));
    return project ? members.map(user => inProject(user, project)) : members;
}

/**
 * Return user.projects filtered to only IDs that exist (e.g. for display or JWT).
 * Pass existingProjectIds from loadProjects().map(p => p.id) to avoid orphan refs.
 */
export function getDisplayProjectIds(user: User, existingProjectIds: string[]): string[] {
    const set = new Set(existingProjectIds);
    return (user.projects ?? []).filter(id => set.has(id));
}

export async function createUser(user: User, performedBy?: User): Promise<User> {
    return withWriteLock(getUsersFilePath(), () => createUserUnlocked(user, performedBy));
}

async function createUserUnlocked(user: User, performedBy?: User): Promise<User> {
    // Every account has its roles stored: none given is a Writer.
    user = { ...user, roles: normalizeStoredRoles(user.roles) };
    const users = getCachedUsers();
    if (users.some(u => u.email?.toLowerCase() === user.email.trim().toLowerCase())) {
        throw new Error('User with this email already exists');
    }
    if (
        user.auth &&
        Object.keys(user.auth).length &&
        users.some(existing =>
            Object.entries(user.auth!).every(([key, value]) => existing.auth?.[key] === value)
        )
    ) {
        throw Object.assign(new Error('Provider identity is already connected'), { status: 409 });
    }
    await triggerEvent('user.beforeCreate', { user, performedBy });
    users.push(user);
    writePrivateState(getUsersFilePath(), users);
    cachedUsers = null; // Invalidate cache after write
    triggerEvent('user.afterCreate', { user, performedBy });
    return user;
}

/**
 * Set password hash for an existing user (local users.json). Match by user id or email.
 * Reads the file directly to avoid stale cache (same pattern as addProjectToUser).
 */
export async function setUserPasswordHash(
    userIdOrEmail: string,
    passwordHash: string,
    performedBy?: User
): Promise<User> {
    return withWriteLock(getUsersFilePath(), () =>
        setUserPasswordHashUnlocked(userIdOrEmail, passwordHash, performedBy)
    );
}

async function setUserPasswordHashUnlocked(
    userIdOrEmail: string,
    passwordHash: string,
    performedBy?: User
): Promise<User> {
    const key = userIdOrEmail.trim();
    if (!key) {
        throw new Error('User id or email is required');
    }
    if (!passwordHash) {
        throw new Error('passwordHash is required');
    }

    const filePath = getUsersFilePath();
    let users: User[];
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        users = JSON.parse(data);
    } catch (err) {
        throw new Error(
            `setUserPasswordHash: failed to read users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }

    const lower = key.toLowerCase();
    const index = users.findIndex(
        u => u.id === key || u.email === key || u.email.toLowerCase() === lower
    );
    if (index === -1) {
        throw new Error(`User not found: ${key}`);
    }

    const current = users[index];
    const updated: User = { ...current, passwordHash, authVersion: (current.authVersion ?? 0) + 1 };
    users = users.slice();
    users[index] = updated;

    await triggerEvent('user.beforeUpdate', { user: updated, performedBy });
    try {
        writePrivateState(filePath, users);
    } catch (err) {
        throw new Error(
            `setUserPasswordHash: failed to write users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }
    cachedUsers = null;
    if (updated.authVersion !== current.authVersion) revokeAuthSession(updated.id);
    triggerEvent('user.afterUpdate', { user: updated, performedBy });
    return updated;
}

/**
 * Add a project ID to a user's projects array (e.g. after project create).
 * Keeps user.projects in sync so the creator is linked to the new project.
 * Reads users from file to avoid stale cache from the same request.
 * @throws Error if user not found (so assignment failure is not silent).
 */
export async function addProjectToUser(userId: string, projectId: string): Promise<void> {
    return withWriteLock(getUsersFilePath(), () => addProjectToUserUnlocked(userId, projectId));
}

async function addProjectToUserUnlocked(userId: string, projectId: string): Promise<void> {
    if (!userId || !projectId) {
        throw new Error('addProjectToUser: userId and projectId are required');
    }
    const filePath = getUsersFilePath();
    let users: User[];
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        users = JSON.parse(data);
    } catch (err) {
        throw new Error(
            `addProjectToUser: failed to read users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
        throw new Error(
            `addProjectToUser: user "${userId}" not found in users file. Cannot assign project "${projectId}".`
        );
    }
    const u = users[index];
    const projects = u.projects ?? [];
    if (projects.includes(projectId)) return;
    users = users.slice();
    users[index] = { ...u, projects: [...projects, projectId] };
    try {
        writePrivateState(filePath, users);
    } catch (err) {
        throw new Error(
            `addProjectToUser: failed to write users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }
    cachedUsers = null;
}

/**
 * Remove a project ID from a single user's projects array (e.g. when user is removed from project.users).
 */
export async function removeProjectFromUser(userId: string, projectId: string): Promise<void> {
    return withWriteLock(getUsersFilePath(), () =>
        removeProjectFromUserUnlocked(userId, projectId)
    );
}

async function removeProjectFromUserUnlocked(userId: string, projectId: string): Promise<void> {
    if (!userId || !projectId) return;
    const filePath = getUsersFilePath();
    let users: User[];
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        users = JSON.parse(data);
    } catch {
        return;
    }
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return;
    const u = users[index];
    const projects = (u.projects ?? []).filter(id => id !== projectId);
    if (projects.length === (u.projects?.length ?? 0)) return;
    users = users.slice();
    users[index] = { ...u, projects };
    try {
        writePrivateState(filePath, users);
    } catch {
        // ignore
    }
    cachedUsers = null;
}

/**
 * Remove a project ID from every user's projects array (e.g. after project delete).
 * Keeps user.projects in sync so orphan links are not left in users.json.
 */
export async function removeProjectFromAllUsers(projectId: string): Promise<void> {
    return withWriteLock(getUsersFilePath(), () => removeProjectFromAllUsersUnlocked(projectId));
}

async function removeProjectFromAllUsersUnlocked(projectId: string): Promise<void> {
    const users = getCachedUsers();
    let changed = false;
    const updated = users.map(u => {
        if (!u.projects?.length) return u;
        const next = (u.projects ?? []).filter(id => id !== projectId);
        if (next.length !== (u.projects?.length ?? 0)) {
            changed = true;
            return { ...u, projects: next };
        }
        return u;
    });
    if (changed) {
        writePrivateState(getUsersFilePath(), updated);
        cachedUsers = null;
    }
}

// Optional: expose for debugging or forced reloads
export function reloadUsers(): void {
    cachedUsers = null;
}

/** Persist last successful login time (ISO 8601). Returns the timestamp written, if any. */
export async function recordUserLogin(userId: string): Promise<string | undefined> {
    return withWriteLock(getUsersFilePath(), () => recordUserLoginUnlocked(userId));
}

async function recordUserLoginUnlocked(userId: string): Promise<string | undefined> {
    if (!userId) return undefined;
    const filePath = getUsersFilePath();
    let users: User[];
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        users = JSON.parse(data);
    } catch {
        return undefined;
    }
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return undefined;
    const u = users[index];
    const iso = new Date().toISOString();
    users = users.slice();
    users[index] = { ...u, lastLoginAt: iso };
    try {
        writePrivateState(filePath, users);
    } catch {
        return undefined;
    }
    cachedUsers = null;
    return iso;
}

export interface OperatorUserPatch {
    name?: string;
    email?: string;
    isActive?: boolean;
    roles?: string[];
    /** Public path, absolute URL, or empty string to clear. */
    avatar?: string;
}

/**
 * Update a user record (users.json): operators only (they act as the engine, see
 * requireOperator). No account role allows it.
 */
export async function updateUserAsOperator(
    userId: string,
    patch: OperatorUserPatch,
    performedBy: User
): Promise<User> {
    return withWriteLock(getUsersFilePath(), () =>
        updateUserAsOperatorUnlocked(userId, patch, performedBy)
    );
}

async function updateUserAsOperatorUnlocked(
    userId: string,
    patch: OperatorUserPatch,
    performedBy: User
): Promise<User> {
    if (!isSystemActor(performedBy)) {
        throw new Error('Only an operator can change an account');
    }
    if (!userId) {
        throw new Error('User id is required');
    }
    const filePath = getUsersFilePath();
    let users: User[];
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        users = JSON.parse(data);
    } catch (err) {
        throw new Error(
            `updateUserAsOperator: failed to read users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
        throw new Error(`User not found: ${userId}`);
    }
    const current = users[index];

    if (patch.email !== undefined) {
        const nextEmail = patch.email.trim();
        if (!nextEmail) {
            throw new Error('Email cannot be empty');
        }
        const lower = nextEmail.toLowerCase();
        const taken = users.some((u, i) => i !== index && u.email.toLowerCase() === lower);
        if (taken) {
            throw new Error('Email already in use');
        }
    }

    const nextAvatar = patch.avatar !== undefined ? patch.avatar.trim() || undefined : undefined;

    const updated: User = {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name.trim() || undefined } : {}),
        ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.roles !== undefined ? { roles: normalizeStoredRoles(patch.roles) } : {}),
        ...(patch.avatar !== undefined ? { avatar: nextAvatar } : {})
    };
    if (
        updated.email !== current.email ||
        updated.isActive !== current.isActive ||
        JSON.stringify(updated.roles) !== JSON.stringify(current.roles)
    ) {
        updated.authVersion = (current.authVersion ?? 0) + 1;
    }

    users = users.slice();
    users[index] = updated;
    await triggerEvent('user.beforeUpdate', { user: updated, performedBy });
    try {
        writePrivateState(filePath, users);
    } catch (err) {
        throw new Error(
            `updateUserAsOperator: failed to write users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
        );
    }
    cachedUsers = null;
    if (updated.authVersion !== current.authVersion) revokeAuthSession(updated.id);
    triggerEvent('user.afterUpdate', { user: updated, performedBy });
    return updated;
}

/**
 * Change one stored user under the users file's lock (credentials, two-step sign-in). `update`
 * returns the new record, or null to leave it as it is. Returns the record as saved.
 */
export async function updateStoredUser(
    userId: string,
    update: (user: User) => User | null
): Promise<User> {
    return withWriteLock(getUsersFilePath(), async () => {
        const filePath = getUsersFilePath();
        const users = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as User[];
        const index = users.findIndex(u => u.id === userId);
        if (index === -1) throw new Error(`User not found: ${userId}`);
        const next = update(users[index]);
        if (!next) return users[index];
        users[index] = { ...next, id: users[index].id };
        writePrivateState(filePath, users);
        cachedUsers = null;
        return users[index];
    });
}

/** A user as it may leave the server: no password hash, no two-step secrets. */
export function withoutSecrets<T extends Partial<User>>(
    user: T
): Omit<T, 'passwordHash' | 'twoFactor' | 'twoFactorPending'> & { twoFactor?: boolean } {
    const {
        passwordHash: _passwordHash,
        twoFactor,
        twoFactorPending: _pending,
        ...rest
    } = user as T & User;
    return { ...rest, ...(twoFactor && { twoFactor: true }) } as never;
}

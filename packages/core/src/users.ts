import fs from 'fs';
import { User } from '@moteurio/types/User.js';
import { storageConfig } from './config/storageConfig.js';
import { writeJsonAtomic } from './utils/fileUtils.js';
import { triggerEvent } from './utils/eventBus.js';

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

export function getUserByEmail(email: string): User | undefined {
    return getCachedUsers().find(u => u.email === email);
}

export function getUserById(id: string): User | undefined {
    return getCachedUsers().find(u => u.id === id);
}

export function getProjectUsers(projectId: string): User[] {
    return getCachedUsers().filter(user => user.projects?.includes(projectId));
}

/**
 * Return user.projects filtered to only IDs that exist (e.g. for display or JWT).
 * Pass existingProjectIds from loadProjects().map(p => p.id) to avoid orphan refs.
 */
export function getDisplayProjectIds(user: User, existingProjectIds: string[]): string[] {
    const set = new Set(existingProjectIds);
    return (user.projects ?? []).filter(id => set.has(id));
}

export function createUser(user: User, performedBy?: User): User {
    const users = getCachedUsers();
    if (users.some(u => u.email === user.email)) {
        throw new Error('User with this email already exists');
    }
    triggerEvent('user.beforeCreate', { user, performedBy });
    users.push(user);
    writeJsonAtomic(getUsersFilePath(), users);
    cachedUsers = null; // Invalidate cache after write
    triggerEvent('user.afterCreate', { user, performedBy });
    return user;
}

/**
 * Set password hash for an existing user (local users.json). Match by user id or email.
 * Reads the file directly to avoid stale cache (same pattern as addProjectToUser).
 */
export function setUserPasswordHash(
    userIdOrEmail: string,
    passwordHash: string,
    performedBy?: User
): User {
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
            `setUserPasswordHash: failed to read users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`
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
    const updated: User = { ...current, passwordHash };
    users = users.slice();
    users[index] = updated;

    triggerEvent('user.beforeUpdate', { user: updated, performedBy });
    try {
        writeJsonAtomic(filePath, users);
    } catch (err) {
        throw new Error(
            `setUserPasswordHash: failed to write users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`
        );
    }
    cachedUsers = null;
    triggerEvent('user.afterUpdate', { user: updated, performedBy });
    return updated;
}

/**
 * Add a project ID to a user's projects array (e.g. after project create).
 * Keeps user.projects in sync so the creator is linked to the new project.
 * Reads users from file to avoid stale cache from the same request.
 * @throws Error if user not found (so assignment failure is not silent).
 */
export function addProjectToUser(userId: string, projectId: string): void {
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
            `addProjectToUser: failed to read users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`
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
        writeJsonAtomic(filePath, users);
    } catch (err) {
        throw new Error(
            `addProjectToUser: failed to write users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`
        );
    }
    cachedUsers = null;
}

/**
 * Remove a project ID from a single user's projects array (e.g. when user is removed from project.users).
 */
export function removeProjectFromUser(userId: string, projectId: string): void {
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
        writeJsonAtomic(filePath, users);
    } catch {
        // ignore
    }
    cachedUsers = null;
}

/**
 * Remove a project ID from every user's projects array (e.g. after project delete).
 * Keeps user.projects in sync so orphan links are not left in users.json.
 */
export function removeProjectFromAllUsers(projectId: string): void {
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
        writeJsonAtomic(getUsersFilePath(), updated);
        cachedUsers = null;
    }
}

// Optional: expose for debugging or forced reloads
export function reloadUsers(): void {
    cachedUsers = null;
}

/** Persist last successful login time (ISO 8601). Returns the timestamp written, if any. */
export function recordUserLogin(userId: string): string | undefined {
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
        writeJsonAtomic(filePath, users);
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
 * Update a user record (users.json). Caller must enforce platform admin (`admin` role).
 */
export function updateUserAsOperator(
    userId: string,
    patch: OperatorUserPatch,
    performedBy: User
): User {
    if (!performedBy.roles?.includes('admin')) {
        throw new Error('Admin role required');
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
            `updateUserAsOperator: failed to read users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`
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
        ...(patch.roles !== undefined ? { roles: [...patch.roles] } : {}),
        ...(patch.avatar !== undefined ? { avatar: nextAvatar } : {})
    };

    users = users.slice();
    users[index] = updated;
    triggerEvent('user.beforeUpdate', { user: updated, performedBy });
    try {
        writeJsonAtomic(filePath, users);
    } catch (err) {
        throw new Error(
            `updateUserAsOperator: failed to write users file (${filePath}): ${err instanceof Error ? err.message : String(err)}`
        );
    }
    cachedUsers = null;
    triggerEvent('user.afterUpdate', { user: updated, performedBy });
    return updated;
}

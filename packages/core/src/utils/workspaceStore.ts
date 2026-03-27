/**
 * Workspace store — all reads and writes for .moteur/ (gitignored).
 * Uses projectStorage under the hood; provides read-with-default, atomic write, and patch.
 * No in-memory caching; always read from disk.
 */
import { getProjectJson, putProjectJson, listProjectKeys } from './projectStorage.js';
import { workspaceDir } from './pathUtils.js';
import fs from 'fs/promises';
import path from 'path';
import {
    ACTIVITY_KEY,
    COMMENTS_KEY,
    REVIEWS_KEY,
    NOTIFICATIONS_KEY,
    WEBHOOK_LOG_KEY,
    RADAR_KEY,
    scheduleKey,
    scheduleListPrefix
} from './storageKeys.js';

const WORKSPACE_PREFIX = '.moteur/';

function assertWorkspaceKey(key: string): void {
    const normalized = key.replace(/\\/g, '/');
    if (!normalized.startsWith(WORKSPACE_PREFIX)) {
        throw new Error(`WorkspaceStore: key must be under ${WORKSPACE_PREFIX}, got ${key}`);
    }
}

/**
 * Read a workspace key. Returns default when file does not exist.
 */
export async function read<T = unknown>(projectId: string, key: string, defaultVal: T): Promise<T> {
    assertWorkspaceKey(key);
    const val = await getProjectJson<T>(projectId, key);
    if (val === null || val === undefined) return defaultVal;
    return val;
}

/**
 * Write a workspace key. Atomic (temp file then rename) via putProjectJson.
 */
export async function write(projectId: string, key: string, data: unknown): Promise<void> {
    assertWorkspaceKey(key);
    await putProjectJson(projectId, key, data);
}

/**
 * Patch a workspace key: read current (or default), apply patcher, write result.
 */
export async function patch<T>(
    projectId: string,
    key: string,
    patcher: (current: T) => T,
    defaultVal: T
): Promise<T> {
    assertWorkspaceKey(key);
    const current = (await getProjectJson<T>(projectId, key)) ?? defaultVal;
    const next = patcher(current);
    await putProjectJson(projectId, key, next);
    return next;
}

/**
 * Ensure .moteur/ exists and has empty default files for known keys.
 * Idempotent; safe to call on every project access or once at project creation.
 */
export async function ensureWorkspace(projectId: string): Promise<void> {
    const dir = workspaceDir(projectId);
    await fs.mkdir(dir, { recursive: true });
    const defaults: [string, unknown][] = [
        ['activity.json', []],
        ['comments.json', []],
        ['reviews.json', []],
        ['notifications.json', []],
        ['webhook-log.json', []],
        ['radar.json', null]
    ];
    for (const [name, data] of defaults) {
        const filePath = path.join(dir, name);
        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
        }
    }
    const schedulesDir = path.join(dir, 'schedules');
    await fs.mkdir(schedulesDir, { recursive: true }).catch(() => {});
}

// ——— Typed accessors ———

export async function getActivity(projectId: string): Promise<unknown[]> {
    return read(projectId, ACTIVITY_KEY, []);
}

export async function setActivity(projectId: string, data: unknown[]): Promise<void> {
    return write(projectId, ACTIVITY_KEY, data);
}

export async function getComments(projectId: string): Promise<unknown[]> {
    return read(projectId, COMMENTS_KEY, []);
}

export async function setComments(projectId: string, data: unknown[]): Promise<void> {
    return write(projectId, COMMENTS_KEY, data);
}

export async function getReviews(projectId: string): Promise<unknown[]> {
    return read(projectId, REVIEWS_KEY, []);
}

export async function setReviews(projectId: string, data: unknown[]): Promise<void> {
    return write(projectId, REVIEWS_KEY, data);
}

export async function getNotifications(projectId: string): Promise<unknown[]> {
    return read(projectId, NOTIFICATIONS_KEY, []);
}

export async function setNotifications(projectId: string, data: unknown[]): Promise<void> {
    return write(projectId, NOTIFICATIONS_KEY, data);
}

export async function getWebhookLog(projectId: string): Promise<unknown[]> {
    return read(projectId, WEBHOOK_LOG_KEY, []);
}

export async function setWebhookLog(projectId: string, data: unknown[]): Promise<void> {
    return write(projectId, WEBHOOK_LOG_KEY, data);
}

export async function getRadar(projectId: string): Promise<unknown | null> {
    return read<unknown | null>(projectId, RADAR_KEY, null);
}

export async function setRadar(projectId: string, data: unknown | null): Promise<void> {
    return write(projectId, RADAR_KEY, data);
}

export async function getSchedule<T = unknown>(
    projectId: string,
    scheduleId: string
): Promise<T | null> {
    const key = scheduleKey(scheduleId);
    const val = await getProjectJson<T>(projectId, key);
    return val ?? null;
}

export async function setSchedule(
    projectId: string,
    scheduleId: string,
    data: unknown
): Promise<void> {
    return write(projectId, scheduleKey(scheduleId), data);
}

export async function listScheduleIds(projectId: string): Promise<string[]> {
    const names = await listProjectKeys(projectId, scheduleListPrefix());
    return names.map(n => (n.endsWith('.json') ? n.slice(0, -5) : n)).filter(Boolean);
}

export const WorkspaceStore = {
    read,
    write,
    patch,
    ensureWorkspace,
    getActivity,
    setActivity,
    getComments,
    setComments,
    getReviews,
    setReviews,
    getNotifications,
    setNotifications,
    getWebhookLog,
    setWebhookLog,
    getRadar,
    setRadar,
    getSchedule,
    setSchedule,
    listScheduleIds
};

/**
 * User data store — all reads and writes for user-data/ (gitignored).
 * Form submissions: hard delete only, deletion logged to activity.
 */
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
    getProjectJson,
    putProjectJson,
    deleteProjectKey,
    listProjectKeys
} from './projectStorage.js';
import { userDataDir } from './pathUtils.js';
import { submissionKey, submissionListPrefix } from './storageKeys.js';
import { log as logActivity } from '../activityLogger.js';
import type { FormSubmission } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const USERDATA_PREFIX = 'user-data/';

function assertUserDataKey(key: string): void {
    const normalized = key.replace(/\\/g, '/');
    if (!normalized.startsWith(USERDATA_PREFIX)) {
        throw new Error(`UserDataStore: key must be under ${USERDATA_PREFIX}, got ${key}`);
    }
}

/**
 * Ensure user-data/ and user-data/forms exist. Idempotent.
 */
export async function ensureUserData(projectId: string): Promise<void> {
    const dir = userDataDir(projectId);
    await fs.mkdir(path.join(dir, 'forms'), { recursive: true });
}

/**
 * Get a single submission by id. Returns null if not found.
 */
export async function getSubmission(
    projectId: string,
    formId: string,
    submissionId: string
): Promise<FormSubmission | null> {
    const key = submissionKey(formId, submissionId);
    assertUserDataKey(key);
    return getProjectJson<FormSubmission>(projectId, key);
}

/**
 * List submission ids for a form (no filter).
 */
export async function listSubmissionIds(projectId: string, formId: string): Promise<string[]> {
    const names = await listProjectKeys(projectId, submissionListPrefix(formId));
    return names.map(n => (n.endsWith('.json') ? n.slice(0, -5) : n)).filter(Boolean);
}

/**
 * Save a form submission to the correct path (user-data/forms/{formId}/{submissionId}.json).
 */
export async function saveSubmission(
    projectId: string,
    formId: string,
    submission: FormSubmission
): Promise<void> {
    const key = submissionKey(formId, submission.id);
    assertUserDataKey(key);
    await putProjectJson(projectId, key, submission);
}

/**
 * Hard delete a submission: file removed, no recovery. Deletion logged to activity.
 */
export async function deleteSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    user: User
): Promise<void> {
    const key = submissionKey(formId, submissionId);
    assertUserDataKey(key);
    const submission = await getProjectJson<FormSubmission>(projectId, key);
    await deleteProjectKey(projectId, key);
    logActivity({
        id: randomUUID(),
        projectId,
        resourceType: 'form',
        resourceId: `${formId}:${submissionId}`,
        action: 'deleted',
        userId: user.id,
        userName: user.name ?? user.id,
        before: submission ?? undefined,
        timestamp: new Date().toISOString()
    });
}

/**
 * Export submissions for a form as JSON or CSV.
 * Returns { format: 'json', data: FormSubmission[] } or { format: 'csv', data: string }.
 */
export async function exportCollection(
    projectId: string,
    formId: string,
    format: 'json' | 'csv'
): Promise<{ format: 'json'; data: FormSubmission[] } | { format: 'csv'; data: string }> {
    const names = await listProjectKeys(projectId, submissionListPrefix(formId));
    const submissions: FormSubmission[] = [];
    for (const name of names) {
        const id = name.endsWith('.json') ? name.slice(0, -5) : name;
        const sub = await getProjectJson<FormSubmission>(projectId, submissionKey(formId, id));
        if (sub) submissions.push(sub);
    }
    if (format === 'json') {
        return { format: 'json', data: submissions };
    }
    if (submissions.length === 0) {
        return { format: 'csv', data: '' };
    }
    const keys = new Set<string>();
    submissions.forEach(s => {
        if (s.data && typeof s.data === 'object') Object.keys(s.data).forEach(k => keys.add(k));
    });
    const headers = ['id', 'status', 'receivedAt', ...Array.from(keys).sort()];
    function escapeCsvCell(val: unknown): string {
        if (val == null) return '';
        const s = String(val);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }
    const rows = submissions.map(s => {
        const row: unknown[] = [
            s.id,
            s.status ?? '',
            (s.metadata as { submittedAt?: string } | undefined)?.submittedAt ?? ''
        ];
        headers
            .slice(3)
            .forEach(h => row.push((s.data && (s.data as Record<string, unknown>)[h]) ?? ''));
        return row.map(escapeCsvCell);
    });
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map(r => r.join(','))].join('\n');
    return { format: 'csv', data: csv };
}

export const UserDataStore = {
    ensureUserData,
    getSubmission,
    listSubmissionIds,
    saveSubmission,
    deleteSubmission,
    exportCollection
};

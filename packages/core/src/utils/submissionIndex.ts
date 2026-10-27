import type { FormSubmission, FormSubmissionStatus } from '@moteurio/types/Form.js';
import { getProjectJson, putProjectJson, listProjectKeys } from './projectStorage.js';
import { submissionKey, submissionListPrefix } from './storageKeys.js';

/**
 * One line per submission of a form, so the inbox can count, filter and page without opening
 * every file. Kept up to date on every save and delete; rebuilt from the files when it's missing
 * or no longer lists the same submissions (a file removed by hand, a crash between two writes).
 */

export type SubmissionRow = {
    id: string;
    submittedAt: string;
    status: FormSubmissionStatus;
    read: boolean;
    spamAt?: string;
};

type IndexFile = { version: 1; rows: SubmissionRow[] };

/** Names starting with `_` in a form's folder are the engine's, not submissions. */
export const INDEX_NAME = '_index';
const indexKey = (formId: string) => submissionKey(formId, INDEX_NAME);

export function rowOf(s: FormSubmission): SubmissionRow {
    return {
        id: s.id,
        submittedAt: s.metadata?.submittedAt ?? '',
        status: s.status,
        read: Boolean(s.readAt),
        ...(s.spamAt && { spamAt: s.spamAt })
    };
}

/** The ids of a form's submissions, as their files say. */
export async function submissionFileIds(projectId: string, formId: string): Promise<string[]> {
    const names = await listProjectKeys(projectId, submissionListPrefix(formId));
    return names
        .map(n => (n.endsWith('.json') ? n.slice(0, -5) : n))
        .filter(id => id && !id.startsWith('_'));
}

// One change at a time per form, so two submissions arriving together both get their line.
const queues = new Map<string, Promise<unknown>>();
function inTurn<T>(projectId: string, formId: string, work: () => Promise<T>): Promise<T> {
    const key = `${projectId}\0${formId}`;
    const next = (queues.get(key) ?? Promise.resolve()).then(work, work);
    const settled = next.catch(() => undefined);
    queues.set(key, settled);
    void settled.then(() => {
        if (queues.get(key) === settled) queues.delete(key);
    });
    return next;
}

async function rebuild(projectId: string, formId: string, ids: string[]): Promise<SubmissionRow[]> {
    const rows: SubmissionRow[] = [];
    for (const id of ids) {
        const sub = await getProjectJson<FormSubmission>(projectId, submissionKey(formId, id));
        if (sub) rows.push(rowOf(sub));
    }
    await putProjectJson(projectId, indexKey(formId), { version: 1, rows } satisfies IndexFile);
    return rows;
}

/** Every submission's line, rebuilt first if the index doesn't match the files. */
export function readIndex(projectId: string, formId: string): Promise<SubmissionRow[]> {
    return inTurn(projectId, formId, async () => {
        const [stored, ids] = await Promise.all([
            getProjectJson<IndexFile>(projectId, indexKey(formId)),
            submissionFileIds(projectId, formId)
        ]);
        const rows = Array.isArray(stored?.rows) ? stored.rows : undefined;
        if (rows && rows.length === ids.length) {
            const listed = new Set(rows.map(r => r.id));
            if (ids.every(id => listed.has(id))) return rows;
        }
        return rebuild(projectId, formId, ids);
    });
}

/** Put (or with `remove`, take out) one submission's line. */
export function updateIndex(
    projectId: string,
    formId: string,
    change: { put: SubmissionRow } | { remove: string }
): Promise<void> {
    return inTurn(projectId, formId, async () => {
        const stored = await getProjectJson<IndexFile>(projectId, indexKey(formId));
        // No index yet: the next read builds it from the files, this one included.
        if (!Array.isArray(stored?.rows)) return;
        const id = 'put' in change ? change.put.id : change.remove;
        const rows = stored.rows.filter(r => r.id !== id);
        if ('put' in change) rows.push(change.put);
        await putProjectJson(projectId, indexKey(formId), { version: 1, rows } satisfies IndexFile);
    });
}

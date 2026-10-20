import { randomUUID } from 'crypto';
import type {
    FormSubmission,
    FormSubmissionMeta,
    FormSubmissionStatus,
    FormActionResult,
    FormAction
} from '@moteurio/types/Form.js';
import type { Entry } from '@moteurio/types/Model.js';
import { User } from '@moteurio/types/User.js';
import { isValidId } from './utils/idUtils.js';
import { getForm, getFormForProject } from './forms.js';
import { createEntry } from './entries.js';
import { UserDataStore } from './utils/userDataStore.js';
import { triggerEvent } from './utils/eventBus.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { recordRequest, submissionCount } from './metering.js';
import { assertSubmissionRoom } from './planLimits.js';

function systemUser(): User {
    return { id: 'system', name: 'System', isActive: true, email: '', roles: [], projects: [] };
}

function generateSubmissionId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 12);
}

export interface ListSubmissionsOptions {
    status?: FormSubmissionStatus;
    /** Only submissions nobody has opened yet. */
    unread?: boolean;
    offset?: number;
    limit?: number;
}

export interface SubmissionsPage {
    /** Newest first. */
    submissions: FormSubmission[];
    /** How many match, before offset and limit. */
    total: number;
    /** Unread submissions in the whole form, spam left out. */
    unread: number;
}

const submittedAt = (s: FormSubmission) => s.metadata?.submittedAt ?? '';

/** A form's submissions, newest first, with how many match and how many are unread. */
export async function querySubmissions(
    user: User,
    projectId: string,
    formId: string,
    options?: ListSubmissionsOptions
): Promise<SubmissionsPage> {
    await getForm(user, projectId, formId);

    const ids = await UserDataStore.listSubmissionIds(projectId, formId);
    const all: FormSubmission[] = [];
    for (const id of ids) {
        const sub = await UserDataStore.getSubmission(projectId, formId, id);
        if (sub) all.push(sub);
    }
    all.sort((a, b) => submittedAt(b).localeCompare(submittedAt(a)));

    let result = all;
    if (options?.status !== undefined) result = result.filter(s => s.status === options.status);
    if (options?.unread) result = result.filter(s => !s.readAt && s.status !== 'spam');
    const total = result.length;
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = options?.limit !== undefined && options.limit > 0 ? options.limit : undefined;
    return {
        submissions: result.slice(offset, limit === undefined ? undefined : offset + limit),
        total,
        unread: all.filter(s => !s.readAt && s.status !== 'spam').length
    };
}

/** A form's submissions, newest first. */
export async function listSubmissions(
    user: User,
    projectId: string,
    formId: string,
    options?: ListSubmissionsOptions
): Promise<FormSubmission[]> {
    return (await querySubmissions(user, projectId, formId, options)).submissions;
}

/**
 * What a person can change on a submission: whether it is read, and whether it is spam.
 * Marking spam keeps it (out of the unread count); "not spam" puts it back as it was.
 */
export async function updateSubmission(
    user: User,
    projectId: string,
    formId: string,
    submissionId: string,
    patch: { read?: boolean; spam?: boolean }
): Promise<FormSubmission> {
    const submission = await getSubmission(user, projectId, formId, submissionId);
    const next: FormSubmission = { ...submission };
    if (patch.read === true && !next.readAt) {
        next.readAt = new Date().toISOString();
        next.readBy = user.id;
    } else if (patch.read === false) {
        delete next.readAt;
        delete next.readBy;
    }
    if (patch.spam === true && next.status !== 'spam') {
        next.statusBeforeSpam = next.status;
        next.status = 'spam';
    } else if (patch.spam === false && next.status === 'spam') {
        // Caught by the honeypot, its actions never ran: it goes back as received.
        next.status = next.statusBeforeSpam ?? 'received';
        delete next.statusBeforeSpam;
    }
    await UserDataStore.saveSubmission(projectId, formId, next);
    return next;
}

export async function getSubmission(
    user: User,
    projectId: string,
    formId: string,
    submissionId: string
): Promise<FormSubmission> {
    if (!isValidId(submissionId)) {
        throw new Error(`Invalid submission ID: "${submissionId}"`);
    }

    await getForm(user, projectId, formId);

    const submission = await UserDataStore.getSubmission(projectId, formId, submissionId);
    if (!submission) {
        throw new Error(
            `Submission "${submissionId}" not found in form "${formId}" of project "${projectId}".`
        );
    }
    return submission;
}

export async function deleteSubmission(
    user: User,
    projectId: string,
    formId: string,
    submissionId: string
): Promise<void> {
    const submission = await getSubmission(user, projectId, formId, submissionId);

    try {
        await triggerEvent('form.submission.beforeDelete', {
            submission,
            user,
            projectId,
            formId
        });
    } catch {
        // event must not fail the operation
    }

    await UserDataStore.deleteSubmission(projectId, formId, submissionId, user);

    try {
        await triggerEvent('form.submission.afterDelete', {
            submission,
            user,
            projectId,
            formId
        });
    } catch {
        // event must not fail the operation
    }
}

export async function createSubmission(
    projectId: string,
    formId: string,
    data: Record<string, unknown>,
    meta: FormSubmissionMeta
): Promise<FormSubmission> {
    const form = await getFormForProject(projectId, formId);
    if (!form) {
        throw new Error(`Form "${formId}" not found in project "${projectId}".`);
    }

    const caught = meta.honeypotTriggered && form.honeypot !== false;
    if (!caught) assertSubmissionRoom(projectId, submissionCount(projectId));

    let id = generateSubmissionId();
    while (await UserDataStore.getSubmission(projectId, formId, id)) {
        id = generateSubmissionId();
    }

    const submission: FormSubmission = {
        id,
        formId,
        projectId,
        data,
        metadata: meta,
        actionResults: [],
        status: 'received'
    };

    await UserDataStore.saveSubmission(projectId, formId, submission);
    if (!caught) recordRequest('submission', projectId);

    void processSubmission(projectId, formId, submission).catch(() => {
        // fire-and-forget; never throw
    });

    return submission;
}

/**
 * Process a form submission: run actions (createEntry, email, webhook), update status and actionResults.
 * Internal use only; not exported from package index.
 */
async function processSubmission(
    projectId: string,
    formId: string,
    submission: FormSubmission
): Promise<void> {
    const form = await getFormForProject(projectId, formId);
    if (!form) return;

    if (submission.metadata.honeypotTriggered && form.honeypot !== false) {
        const updated: FormSubmission = {
            ...((await UserDataStore.getSubmission(projectId, formId, submission.id)) ??
                submission),
            status: 'spam'
        };
        await UserDataStore.saveSubmission(projectId, formId, updated);
        return;
    }

    const actions: FormAction[] = form.actions ?? [];
    const actionResults: FormActionResult[] = [];

    for (const action of actions) {
        if (action.type === 'createEntry') {
            try {
                const fieldMap = action.fieldMap ?? {};
                const entryData: Record<string, unknown> = {};
                for (const [formFieldId, value] of Object.entries(submission.data)) {
                    if (value === undefined) continue;
                    const modelFieldId = fieldMap[formFieldId] ?? formFieldId;
                    entryData[modelFieldId] = value;
                }
                const entryId = randomUUID().replace(/-/g, '').slice(0, 12);
                const entry: Entry = {
                    id: entryId,
                    type: action.modelId,
                    data: entryData,
                    status: 'draft'
                };
                await createEntry(systemUser(), projectId, action.modelId, entry, {
                    source: 'api'
                });
                actionResults.push({ type: 'createEntry', status: 'success', entryId });
            } catch (err) {
                actionResults.push({
                    type: 'createEntry',
                    status: 'failed',
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        } else if (action.type === 'email') {
            // Stub: real email sending out of scope
            actionResults.push({
                type: 'email',
                status: 'success',
                error: '(email stub: not sent)'
            });
        } else if (action.type === 'webhook') {
            try {
                await webhookDispatch(
                    'form.submitted',
                    {
                        formId,
                        formHandle: form.label ?? form.id,
                        submissionId: submission.id,
                        fields: submission.data
                    },
                    { projectId, source: 'api' }
                );
            } catch {
                // never fail the operation
            }
        }
    }

    // If no webhook action was run, always dispatch form.submitted once
    const hasWebhookAction = actions.some(a => a.type === 'webhook');
    if (!hasWebhookAction) {
        try {
            await webhookDispatch(
                'form.submitted',
                {
                    formId,
                    formHandle: form.label ?? form.id,
                    submissionId: submission.id,
                    fields: submission.data
                },
                { projectId, source: 'api' }
            );
        } catch {
            // never fail the operation
        }
    }

    // Read again: someone may have opened it while the actions ran.
    const latest =
        (await UserDataStore.getSubmission(projectId, formId, submission.id)) ?? submission;
    const updated: FormSubmission = {
        ...latest,
        status: latest.status === 'spam' ? 'spam' : 'processed',
        actionResults
    };
    await UserDataStore.saveSubmission(projectId, formId, updated);

    try {
        await triggerEvent('form.submitted', {
            form,
            submission: updated,
            projectId,
            formId
        });
    } catch {
        // event must not fail the operation
    }
}

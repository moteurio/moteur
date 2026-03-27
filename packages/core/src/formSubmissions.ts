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

function systemUser(): User {
    return { id: 'system', name: 'System', isActive: true, email: '', roles: [], projects: [] };
}

function generateSubmissionId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 12);
}

export interface ListSubmissionsOptions {
    status?: FormSubmissionStatus;
    limit?: number;
}

export async function listSubmissions(
    user: User,
    projectId: string,
    formId: string,
    options?: ListSubmissionsOptions
): Promise<FormSubmission[]> {
    await getForm(user, projectId, formId);

    const ids = await UserDataStore.listSubmissionIds(projectId, formId);
    const submissions: FormSubmission[] = [];
    for (const id of ids) {
        const sub = await UserDataStore.getSubmission(projectId, formId, id);
        if (sub) submissions.push(sub);
    }

    let result = submissions;
    if (options?.status !== undefined) {
        result = result.filter(s => s.status === options.status);
    }
    if (options?.limit !== undefined && options.limit > 0) {
        result = result.slice(0, options.limit);
    }
    return result;
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
            ...submission,
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

    const updated: FormSubmission = {
        ...submission,
        status: 'processed',
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

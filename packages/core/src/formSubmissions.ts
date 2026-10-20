import { randomUUID } from 'crypto';
import type {
    FormSchema,
    FormSubmission,
    FormSubmissionMeta,
    FormSubmissionStatus,
    FormActionResult,
    FormAction
} from '@moteurio/types/Form.js';
import type { Entry } from '@moteurio/types/Model.js';
import { User } from '@moteurio/types/User.js';
import { isValidId } from './utils/idUtils.js';
import { systemActor } from './utils/systemActor.js';
import { getForm, getFormForProject } from './forms.js';
import { createEntry } from './entries.js';
import { getModelSchemaForProject } from './models.js';
import { UserDataStore } from './utils/userDataStore.js';
import { triggerEvent } from './utils/eventBus.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { sendEmail } from './emailNotifier.js';
import { recordRequest, submissionCount } from './metering.js';
import { assertSubmissionRoom } from './planLimits.js';

/** Form actions are the engine's own work, done for whoever sent the form. */
const systemUser = (): User => systemActor('_forms', 'Forms');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A submitted value as text for an email: lists joined, objects as their values. */
function asText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(asText).join(', ');
    if (typeof value === 'object')
        return Object.values(value).map(asText).filter(Boolean).join(', ');
    return String(value);
}

/** `{{name}}` in a subject or body becomes that answer. */
export function fillIn(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key: string) => asText(data[key]));
}

/** The address to reply to: the form's email field, when it holds one. */
function senderEmail(form: FormSchema, data: Record<string, unknown>): string | undefined {
    const key =
        Object.entries(form.fields ?? {}).find(([, f]) => f.type === 'core/email')?.[0] ??
        Object.keys(form.fields ?? {}).find(k => /^(e-?mail|courriel)$/i.test(k));
    const v = key ? data[key] : undefined;
    return typeof v === 'string' && EMAIL.test(v.trim()) ? v.trim() : undefined;
}

/** Every answer, one per line, labelled: the team's notice. */
function answersText(form: FormSchema, data: Record<string, unknown>): string {
    const label = (key: string) => {
        const l = form.fields?.[key]?.label as unknown;
        if (typeof l === 'string') return l;
        if (l && typeof l === 'object') return String(Object.values(l)[0] ?? key);
        return key;
    };
    const keys = [...new Set([...Object.keys(form.fields ?? {}), ...Object.keys(data)])];
    return keys
        .filter(k => data[k] !== undefined && data[k] !== '')
        .map(k => `${label(k)}:\n${asText(data[k])}`)
        .join('\n\n');
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
                const model = await getModelSchemaForProject(projectId, action.modelId);
                const entryData: Record<string, unknown> = {};
                for (const [formFieldId, value] of Object.entries(submission.data)) {
                    if (value === undefined) continue;
                    // An empty mapping means "not kept"; by default, the field of the same name.
                    const modelFieldId = fieldMap[formFieldId] ?? formFieldId;
                    if (!modelFieldId) continue;
                    // Answers the model has no field for are left out (they stay in the letter).
                    if (model?.fields && !model.fields[modelFieldId]) continue;
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
            try {
                await sendEmail({
                    to: action.to,
                    subject: fillIn(action.subject, submission.data),
                    text: fillIn(action.body, submission.data),
                    replyTo: senderEmail(form, submission.data)
                });
                actionResults.push({ type: 'email', status: 'success' });
            } catch (err) {
                actionResults.push({
                    type: 'email',
                    status: 'failed',
                    error: err instanceof Error ? err.message : String(err)
                });
            }
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

    // The team's notice, then the sender's confirmation.
    const notify = form.notifications?.onSubmit;
    if (notify?.to?.length) {
        try {
            await sendEmail({
                to: notify.to,
                subject: fillIn(notify.subject || `New message: ${form.label}`, submission.data),
                text: answersText(form, submission.data),
                replyTo: senderEmail(form, submission.data)
            });
            actionResults.push({ type: 'notify', status: 'success' });
        } catch (err) {
            actionResults.push({
                type: 'notify',
                status: 'failed',
                error: err instanceof Error ? err.message : String(err)
            });
        }
    }
    const confirm = form.notifications?.confirmationEmail;
    const confirmTo = confirm ? submission.data[confirm.fieldRef] : undefined;
    if (confirm && typeof confirmTo === 'string' && EMAIL.test(confirmTo.trim())) {
        const locale = submission.metadata.locale;
        const body =
            (locale && confirm.body?.[locale]) ?? Object.values(confirm.body ?? {})[0] ?? '';
        try {
            await sendEmail({
                to: [confirmTo.trim()],
                subject: fillIn(confirm.subject || form.label, submission.data),
                text: fillIn(body, submission.data)
            });
            actionResults.push({ type: 'confirm', status: 'success' });
        } catch (err) {
            actionResults.push({
                type: 'confirm',
                status: 'failed',
                error: err instanceof Error ? err.message : String(err)
            });
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

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
import { assertCanReadSubmissions, assertNotReviewOnly } from './contentAccess.js';
import { systemActor } from './utils/systemActor.js';
import { getForm, getFormForProject } from './forms.js';
import { createEntry } from './entries.js';
import { getModelSchemaForProject } from './models.js';
import { UserDataStore } from './utils/userDataStore.js';
import { triggerEvent } from './utils/eventBus.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { sendEmail } from './emailNotifier.js';
import { readerOf, renderEmail } from './email/render.js';
import { projectMailOf, type ProjectMail } from './projectEmail.js';
import { getUserByEmail } from './users.js';
import type { EmailLook } from './email/settings.js';
import { getProjectById } from './projects.js';
import { recordRequest, submissionCount } from './metering.js';
import { assertSubmissionRoom } from './planLimits.js';
import { answersMessage, checkAnswers } from './formAnswers.js';
import { screenSubmission, type SubmissionProof } from './formGuard.js';
import { holdWithPlugins, runFormAction } from './plugins/formExtensions.js';
import type { SubmissionRow } from './utils/submissionIndex.js';

/** Form actions run as the engine itself, on behalf of the visitor who submitted the form. */
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

/** The address to reply to: the value of the form's email field, if it has one. */
function senderEmail(form: FormSchema, data: Record<string, unknown>): string | undefined {
    const key =
        Object.entries(form.fields ?? {}).find(([, f]) => f.type === 'core/email')?.[0] ??
        Object.keys(form.fields ?? {}).find(k => /^(e-?mail|courriel)$/i.test(k));
    const v = key ? data[key] : undefined;
    return typeof v === 'string' && EMAIL.test(v.trim()) ? v.trim() : undefined;
}

/** Every answer with its label, for the notification email sent to the project's team. */
function answerRows(
    form: FormSchema,
    data: Record<string, unknown>
): { label: string; value: string }[] {
    const label = (key: string) => {
        const l = form.fields?.[key]?.label as unknown;
        if (typeof l === 'string') return l;
        if (l && typeof l === 'object') return String(Object.values(l)[0] ?? key);
        return key;
    };
    const keys = [...new Set([...Object.keys(form.fields ?? {}), ...Object.keys(data)])];
    return keys
        .filter(k => data[k] !== undefined && data[k] !== '')
        .map(k => ({ label: label(k), value: asText(data[k]) }));
}

/** A project's email to its visitors: the project's own wording, with its name, logo and colour. */
function projectMessage(mail: ProjectMail, subject: string, body: string, locale?: string) {
    const email = renderEmail(
        'form-message',
        { project: mail.brand.name, subject, body },
        { locale, project: mail.brand }
    );
    return {
        subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments,
        fromName: mail.fromName,
        ...(mail.fromAddress && { fromAddress: mail.fromAddress })
    };
}

/**
 * The form's notice is the server's mail to the project's people: each in their own look and
 * language when they have an account. One email per look and language, to everyone sharing it.
 */
function byReader(addresses: string[]): { to: string[]; locale?: string; look?: EmailLook }[] {
    const groups = new Map<string, { to: string[]; locale?: string; look?: EmailLook }>();
    for (const address of addresses) {
        const reader = readerOf(getUserByEmail(address.trim().toLowerCase()));
        const key = `${reader.look ?? ''}|${reader.locale ?? ''}`;
        const group = groups.get(key) ?? { to: [], ...reader };
        group.to.push(address);
        groups.set(key, group);
    }
    return [...groups.values()];
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

/** Spam is deleted this long after it arrived, or after someone marked it. */
export const SPAM_KEPT_DAYS = 30;
const PURGE_EVERY_MS = 60 * 60 * 1000;
const lastPurge = new Map<string, number>();

/** Delete a form's spam older than 30 days. Returns how many went. */
export async function purgeOldSpam(
    projectId: string,
    formId: string,
    now = Date.now()
): Promise<number> {
    lastPurge.set(`${projectId}\0${formId}`, now);
    const cutoff = new Date(now - SPAM_KEPT_DAYS * 86_400_000).toISOString();
    const old = (await UserDataStore.readIndex(projectId, formId)).filter(
        r => r.status === 'spam' && (r.spamAt ?? r.submittedAt) < cutoff
    );
    for (const row of old) await UserDataStore.purgeSubmission(projectId, formId, row.id);
    return old.length;
}

/** Purges a form's old spam at most once an hour, triggered by use of the form, so no scheduler is needed. */
function purgeNowAndThen(projectId: string, formId: string): void {
    const last = lastPurge.get(`${projectId}\0${formId}`) ?? 0;
    if (Date.now() - last < PURGE_EVERY_MS) return;
    void purgeOldSpam(projectId, formId).catch(() => {
        // The next use of the form tries again.
    });
}

const unreadRow = (r: SubmissionRow) => !r.read && r.status !== 'spam';

/** A form's submissions, newest first, with how many match and how many are unread. */
export async function querySubmissions(
    user: User,
    projectId: string,
    formId: string,
    options?: ListSubmissionsOptions
): Promise<SubmissionsPage> {
    assertCanReadSubmissions(user);
    await getForm(user, projectId, formId);
    purgeNowAndThen(projectId, formId);

    // The index provides the counts, so only the submissions on the requested page are read.
    const rows = [...(await UserDataStore.readIndex(projectId, formId))].sort(
        (a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id)
    );
    let result = rows;
    if (options?.status !== undefined) result = result.filter(r => r.status === options.status);
    if (options?.unread) result = result.filter(unreadRow);
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = options?.limit !== undefined && options.limit > 0 ? options.limit : undefined;
    const page = result.slice(offset, limit === undefined ? undefined : offset + limit);
    const submissions: FormSubmission[] = [];
    for (const row of page) {
        const sub = await UserDataStore.getSubmission(projectId, formId, row.id);
        if (sub) submissions.push(sub);
    }
    return { submissions, total: result.length, unread: rows.filter(unreadRow).length };
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
        next.spamAt = new Date().toISOString();
    } else if (patch.spam === false && next.status === 'spam') {
        // The submission was caught as spam on arrival, so its actions never ran. Restore it to the
        // received state.
        next.status = next.statusBeforeSpam ?? 'received';
        delete next.statusBeforeSpam;
        delete next.spamAt;
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
    assertCanReadSubmissions(user);

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
    assertNotReviewOnly(user, 'delete form submissions');
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

/**
 * Stores a visitor's submission. Answers are validated first so a person can fix them, then
 * anti-bot checks run (honeypot, time trap, captcha). Spam is stored for 30 days without any
 * signal to the sender: it runs no actions, sends no email and does not count against the plan.
 */
export async function createSubmission(
    projectId: string,
    formId: string,
    data: Record<string, unknown>,
    meta: FormSubmissionMeta,
    proof: SubmissionProof = { honeypotTriggered: meta.honeypotTriggered }
): Promise<FormSubmission> {
    const form = await getFormForProject(projectId, formId);
    if (!form) {
        throw new Error(`Form "${formId}" not found in project "${projectId}".`);
    }
    purgeNowAndThen(projectId, formId);

    const caught = proof.honeypotTriggered && form.honeypot !== false;
    // Browser-side validation can be bypassed, so validate the answers again here. A caught bot
    // gets the same success response so it learns nothing; only values that fit the form are kept.
    const answers = checkAnswers(form, data, meta.locale);
    if (!caught && answers.issues.length) {
        throw Object.assign(new Error(answersMessage(form, answers.issues, meta.locale)), {
            statusCode: 422,
            code: 'ANSWERS_INVALID',
            issues: answers.issues
        });
    }
    const screening = await screenSubmission(projectId, form, proof, meta.locale, Date.now(), {
        data: answers.data,
        meta
    });
    const spam = Boolean(screening.spamReason);
    if (!spam) assertSubmissionRoom(projectId, submissionCount(projectId));

    let id = generateSubmissionId();
    while (await UserDataStore.getSubmission(projectId, formId, id)) {
        id = generateSubmissionId();
    }

    const now = new Date().toISOString();
    const submission: FormSubmission = {
        id,
        formId,
        projectId,
        data: answers.data,
        metadata: {
            ...meta,
            ...(proof.honeypotTriggered && { honeypotTriggered: true }),
            ...screening
        },
        actionResults: [],
        status: spam ? 'spam' : 'received',
        ...(spam && { spamAt: now })
    };

    await UserDataStore.saveSubmission(projectId, formId, submission);
    if (spam) return submission;
    recordRequest('submission', projectId);

    // A plugin can hold a submission's actions (for example for double opt-in). While held, nothing
    // runs, including the notification email.
    const heldBy = await holdWithPlugins(projectId, form, submission);
    if (heldBy) {
        const held: FormSubmission = {
            ...submission,
            status: 'held',
            metadata: { ...submission.metadata, heldBy }
        };
        await UserDataStore.saveSubmission(projectId, formId, held);
        return held;
    }

    void processSubmission(projectId, formId, submission).catch(() => {
        // fire-and-forget; never throw
    });

    return submission;
}

/**
 * Releases a held submission so its actions, notification and confirmation run now. Intended for
 * the plugin that held it (for example after the visitor confirms their email). No user check.
 * Throws when the submission is not held.
 */
export async function releaseSubmission(
    projectId: string,
    formId: string,
    submissionId: string
): Promise<FormSubmission> {
    if (!isValidId(submissionId)) throw new Error(`Invalid submission ID: "${submissionId}"`);
    const current = await UserDataStore.getSubmission(projectId, formId, submissionId);
    if (!current) throw Object.assign(new Error('Submission not found'), { status: 404 });
    if (current.status !== 'held')
        throw Object.assign(new Error('This submission is not held.'), { status: 409 });
    const { heldBy: _heldBy, ...metadata } = current.metadata;
    const released: FormSubmission = { ...current, status: 'received', metadata };
    await UserDataStore.saveSubmission(projectId, formId, released);
    await processSubmission(projectId, formId, released);
    return (await UserDataStore.getSubmission(projectId, formId, submissionId)) ?? released;
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

    const actions: FormAction[] = form.actions ?? [];
    const actionResults: FormActionResult[] = [];
    const projectSchema = await getProjectById(projectId).catch(() => null);
    const project = projectSchema?.label || projectId;
    const formLabel = typeof form.label === 'string' ? form.label : form.id;
    // Branding for emails to visitors: the project's name, logo, colour, footer and addresses.
    const mail: ProjectMail = projectSchema
        ? await projectMailOf(projectSchema)
        : { brand: { name: project }, fromName: project };

    for (const action of actions) {
        if (action.type === 'createEntry') {
            try {
                const fieldMap = action.fieldMap ?? {};
                const model = await getModelSchemaForProject(projectId, action.modelId);
                const entryData: Record<string, unknown> = {};
                for (const [formFieldId, value] of Object.entries(submission.data)) {
                    if (value === undefined) continue;
                    // An empty mapping means the answer is not copied; with no mapping, the form
                    // field with the same name is used.
                    const modelFieldId = fieldMap[formFieldId] ?? formFieldId;
                    if (!modelFieldId) continue;
                    // Leave out answers the model has no field for. They remain in the submission
                    // itself.
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
                    ...projectMessage(
                        mail,
                        fillIn(action.subject, submission.data),
                        fillIn(action.body, submission.data),
                        submission.metadata.locale
                    ),
                    // Replies go to the visitor who wrote, otherwise to the project's contact address.
                    replyTo: senderEmail(form, submission.data) ?? mail.replyTo
                });
                actionResults.push({ type: 'email', status: 'success' });
            } catch (err) {
                actionResults.push({
                    type: 'email',
                    status: 'failed',
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        } else if (action.type.includes(':')) {
            // A plugin's action records its outcome, and a failure does not stop the other actions.
            const outcome = await runFormAction(
                action.type,
                projectId,
                form,
                submission,
                'config' in action ? action.config : undefined
            );
            actionResults.push({ type: action.type, ...outcome });
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

    // Send the team notification first, then the confirmation to the sender.
    const notify = form.notifications?.onSubmit;
    if (notify?.to?.length) {
        try {
            const rows = answerRows(form, submission.data);
            const replyTo = senderEmail(form, submission.data);
            const subject = fillIn(notify.subject || `New message: ${formLabel}`, submission.data);
            const data = {
                project,
                form: formLabel,
                subject,
                rows,
                text: rows.map(r => `${r.label}:\n${r.value}`).join('\n\n'),
                canReply: Boolean(replyTo)
            };
            for (const group of byReader(notify.to)) {
                const email = renderEmail('form-notice', data, {
                    locale: group.locale,
                    look: group.look
                });
                await sendEmail({
                    to: group.to,
                    subject,
                    text: email.text,
                    html: email.html,
                    fromName: project,
                    replyTo
                });
            }
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
            // This is often the visitor's first email from the project, so lead with the project's
            // text, then what they sent.
            const subject = fillIn(confirm.subject || formLabel, submission.data);
            const email = renderEmail(
                'form-confirm',
                {
                    project: mail.brand.name,
                    site: mail.brand.siteUrl,
                    form: formLabel,
                    subject,
                    body: fillIn(body, submission.data),
                    rows: answerRows(form, submission.data)
                },
                { locale, project: mail.brand }
            );
            // Replies to a confirmation go to the project, never to the server's From address.
            await sendEmail({
                to: [confirmTo.trim()],
                subject,
                text: email.text,
                html: email.html,
                attachments: email.attachments,
                fromName: mail.fromName,
                ...(mail.fromAddress && { fromAddress: mail.fromAddress }),
                ...(mail.replyTo && { replyTo: mail.replyTo })
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

    // If no webhook action ran, still dispatch form.submitted once.
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

    // Read the submission again, because someone may have opened it while the actions ran.
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

/** A form's submissions as summaries (id, date, status, read flag), without a user check. */
export function listSubmissionRows(projectId: string, formId: string): Promise<SubmissionRow[]> {
    return UserDataStore.readIndex(projectId, formId);
}

/** One submission, without a user check. For the engine and its plugins. */
export function getSubmissionForProject(
    projectId: string,
    formId: string,
    submissionId: string
): Promise<FormSubmission | null> {
    if (!isValidId(submissionId)) return Promise.resolve(null);
    return UserDataStore.getSubmission(projectId, formId, submissionId);
}

/** Saves a submission exactly as given (for example with answers removed), without a user check. */
export async function saveSubmissionForProject(submission: FormSubmission): Promise<void> {
    if (!isValidId(submission.id)) throw new Error(`Invalid submission ID: "${submission.id}"`);
    await UserDataStore.saveSubmission(submission.projectId, submission.formId, submission);
}

/**
 * Permanently deletes a submission on behalf of a plugin or the engine. The activity log records
 * who did it (`by`) but keeps no copy of the submission. No user check; the caller decides.
 */
export async function eraseSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    by: { id: string; name: string }
): Promise<void> {
    if (!isValidId(submissionId)) throw new Error(`Invalid submission ID: "${submissionId}"`);
    await UserDataStore.deleteSubmission(
        projectId,
        formId,
        submissionId,
        systemActor(by.id, by.name),
        { keepCopy: false }
    );
}

import { WorkBudget } from './utils/workBudget.js';
import type { Review } from '@moteurio/types/Review.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { readerOf, renderEmail, type RenderedEmail } from './email/render.js';
import { NOTIFICATION_KINDS, type EmailData, type EmailKind } from './email/templates.js';
import { deliver, mailUnavailable, type MailCategory } from './email/transport.js';
import { unsubscribeUrl, wantsEmail } from './email/unsubscribe.js';
import { studioUrl } from './utils/studioUrl.js';
import type { EmailLook } from './email/settings.js';

export { readerOf };

/**
 * Every email the engine sends goes through here: rendered from one template system
 * (./email), sent with the server's SMTP settings and the operator's From, with the headers
 * automated mail should carry. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM;
 * the operator sets the rest (docs/Email.md).
 */

const verificationMailBudget = new WorkBudget(2, 8);

export type ReviewEmailType = 'review_requested' | 'approved' | 'rejected';

/** Why an email can't go out, or null when the server can send mail. */
export function emailUnavailable(): string | null {
    return mailUnavailable();
}

const categoryOf = (kind: EmailKind): MailCategory =>
    NOTIFICATION_KINDS.includes(kind)
        ? 'notification'
        : kind.startsWith('form-')
          ? 'project'
          : kind === 'test'
            ? 'test'
            : 'auth';

function asMail(email: RenderedEmail, to: string[]) {
    return {
        to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments,
        category: categoryOf(email.kind),
        ...(email.unsubscribe && { unsubscribe: email.unsubscribe })
    };
}

/**
 * Sends a ready email (subject, text and HTML parts). Throws with a readable reason (not set up,
 * refused by the server), so callers can record why it didn't go.
 */
export async function sendEmail(message: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    fromName?: string;
    category?: MailCategory;
    unsubscribe?: string;
    attachments?: RenderedEmail['attachments'];
}): Promise<void> {
    await deliver({ category: 'project', ...message });
}

/** Renders one of the engine's emails for this reader and sends it. */
export async function sendTemplateEmail<K extends EmailKind>(
    kind: K,
    to: string[],
    data: EmailData[K],
    options: { locale?: string; look?: EmailLook; replyTo?: string; fromName?: string } = {}
): Promise<void> {
    const email = renderEmail(kind, data, { locale: options.locale, look: options.look });
    await deliver({
        ...asMail(email, to),
        ...(options.replyTo && { replyTo: options.replyTo }),
        ...(options.fromName && { fromName: options.fromName })
    });
}

/** A code by email, within the same small budget as verification mail: never a mail cannon. */
export function sendCodeEmail(message: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    attachments?: RenderedEmail['attachments'];
}): Promise<void> {
    return verificationMailBudget.run(async () => {
        await deliver({ ...message, category: 'auth' });
    });
}

/** Verification must fail visibly if delivery is unavailable; never silently mark mail verified. */
export async function sendVerificationEmail(
    email: string,
    code: string,
    locale?: string
): Promise<void> {
    if (mailUnavailable())
        throw Object.assign(new Error('Email verification is not configured on this server.'), {
            status: 503
        });
    const rendered = renderEmail('verify', { email, code }, { locale });
    return verificationMailBudget.run(async () => {
        await deliver(asMail(rendered, [email]));
    });
}

/**
 * Sends a review-related email. Non-blocking and fail-safe: skipped when mail isn't set up or
 * the person turned review emails off; a failure is logged on the entry, never thrown.
 */
export async function sendReviewEmail(
    type: ReviewEmailType,
    toUser: User,
    review: Review,
    project: ProjectSchema
): Promise<void> {
    if (!toUser?.email) return;
    if (mailUnavailable()) return;
    if (!wantsEmail(toUser, 'reviews')) return;

    const studio = studioUrl();
    const person = type === 'review_requested' ? review.requestedByName : review.reviewedByName;
    try {
        await sendTemplateEmail(
            'review',
            [toUser.email],
            {
                type,
                person: person || undefined,
                project: project?.label || project?.id || review.projectId,
                resource: review.resourceType === 'page' || review.pageId ? 'page' : 'entry',
                ...(studio && {
                    url: `${studio}/projects/${encodeURIComponent(review.projectId)}/reviews/${encodeURIComponent(review.id)}`
                }),
                unsubscribeUrl: unsubscribeUrl(toUser.id, 'reviews')
            },
            readerOf(toUser)
        );
    } catch (err) {
        try {
            const { log, toActivityEvent } = await import('./activityLogger.js');
            log(
                toActivityEvent(
                    review.projectId,
                    'entry',
                    `${review.modelId}__${review.entryId}`,
                    'updated',
                    undefined,
                    undefined,
                    { emailFailed: true, type, toUserId: toUser.id, error: String(err) }
                )
            );
        } catch {
            // ignore logging failure
        }
    }
}

import { WorkBudget } from './utils/workBudget.js';
const verificationMailBudget = new WorkBudget(2, 8);
import type { Review } from '@moteurio/types/Review.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';

export type ReviewEmailType = 'review_requested' | 'approved' | 'rejected';

function isEmailConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

/** A code by email, within the same small budget as verification mail: never a mail cannon. */
export function sendCodeEmail(message: {
    to: string[];
    subject: string;
    text: string;
}): Promise<void> {
    return verificationMailBudget.run(() => sendEmail(message));
}

/** Verification must fail visibly if delivery is unavailable; never silently mark mail verified. */
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
    return verificationMailBudget.run(() => deliverVerificationEmail(email, code));
}

async function deliverVerificationEmail(email: string, code: string): Promise<void> {
    if (!isEmailConfigured())
        throw Object.assign(new Error('Email verification is not configured on this server.'), {
            status: 503
        });
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
        ...(process.env.SMTP_USER && process.env.SMTP_PASS
            ? {
                  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              }
            : {})
    });
    await transporter.sendMail({
        from: process.env.SMTP_FROM!,
        to: email,
        subject: 'Verify your Moteur email',
        text: `Your Moteur verification code is ${code}. It expires with your sign-in in 10 minutes. If you did not request this, ignore this email.`
    });
}

function getSubject(type: ReviewEmailType, projectLabel: string): string {
    const project = projectLabel || 'the project';
    switch (type) {
        case 'review_requested':
            return `Review requested in ${project}`;
        case 'approved':
            return `Entry approved and published in ${project}`;
        case 'rejected':
            return `Entry returned for revisions in ${project}`;
        default:
            return `Review update in ${project}`;
    }
}

function getBody(type: ReviewEmailType, projectLabel: string): string {
    const project = projectLabel || 'the project';
    switch (type) {
        case 'review_requested':
            return `An entry has been submitted for your review in ${project}.`;
        case 'approved':
            return `Your entry has been approved and published in ${project}.`;
        case 'rejected':
            return `Your entry was returned for revisions in ${project}.`;
        default:
            return `There was a review update in ${project}.`;
    }
}

/**
 * Sends a review-related email. Non-blocking and fail-safe.
 * Configure via SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 * If not configured or nodemailer is not available, skips sending without throwing.
 */
export async function sendReviewEmail(
    type: ReviewEmailType,
    toUser: User,
    review: Review,
    project: ProjectSchema
): Promise<void> {
    if (!toUser?.email) return;
    if (!isEmailConfigured()) return;

    const projectLabel = project?.label ?? project?.id ?? 'project';
    const subject = getSubject(type, projectLabel);
    const body = getBody(type, projectLabel);

    try {
        const nodemailer = await import('nodemailer').catch(() => null);
        if (!nodemailer?.default) return;

        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        const transporter = nodemailer.default.createTransport({
            host: process.env.SMTP_HOST,
            port: isNaN(port) ? 587 : port,
            secure: port === 465,
            ...(process.env.SMTP_USER && process.env.SMTP_PASS
                ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
                : {})
        });

        const from = process.env.SMTP_FROM ?? '';
        await transporter.sendMail({
            from,
            to: toUser.email,
            subject,
            text: body
        });
    } catch (err) {
        try {
            const { log } = await import('./activityLogger.js');
            const { toActivityEvent } = await import('./activityLogger.js');
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

/** Why an email can't go out, or null when the server can send mail. */
export function emailUnavailable(): string | null {
    return isEmailConfigured()
        ? null
        : 'Email is not set up on this server (SMTP_HOST and SMTP_FROM).';
}

/**
 * Sends a plain-text email with the server's SMTP settings. Throws with a readable reason
 * (not set up, refused by the server), so callers can record why it didn't go.
 */
export async function sendEmail(message: {
    to: string[];
    subject: string;
    text: string;
    replyTo?: string;
}): Promise<void> {
    const unavailable = emailUnavailable();
    if (unavailable) throw new Error(unavailable);
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer?.default) throw new Error('Email is not available (nodemailer is missing).');
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port: isNaN(port) ? 587 : port,
        secure: port === 465,
        // A slow mail server must not hold requests open.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        ...(process.env.SMTP_USER && process.env.SMTP_PASS
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
            : {})
    });
    await transporter.sendMail({
        from: process.env.SMTP_FROM ?? '',
        to: message.to.join(', '),
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {})
    });
}

import type { Review } from '@moteurio/types/Review.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';

export type ReviewEmailType = 'review_requested' | 'approved' | 'rejected';

function isEmailConfigured(): boolean {
    return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

/**
 * Sends a welcome/onboarding email to a new user. Non-blocking and fail-safe.
 * Uses same SMTP config as sendReviewEmail. If not configured, skips without throwing.
 */
export async function sendWelcomeEmail(user: User): Promise<void> {
    if (!user?.email) return;
    if (!isEmailConfigured()) return;

    const name = user.name || user.email.split('@')[0] || 'there';
    const subject = 'Welcome to Moteur';
    const body = `Hi ${name},\n\nWelcome to Moteur! Your account is ready. You can sign in and explore your demo project.\n\nIf you have any questions, reach out to your team.\n\n— The Moteur team`;

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
            to: user.email,
            subject,
            text: body
        });
    } catch {
        // Fail silently for welcome email
    }
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

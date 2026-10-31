import type { OnboardingIntent, OnboardingState, User } from '@moteurio/types/User.js';
import { copyProjectForNewUser, getDemoProjectId } from './projects.js';
import { getUserById, updateStoredUser } from './users.js';
import { isExistingProjectId } from './utils/fileUtils.js';
import { emailUnavailable, sendEmail } from './emailNotifier.js';
import { readerOf, renderEmail } from './email/render.js';
import { studioUrl } from './utils/studioUrl.js';

/**
 * A new person's first minutes: what they came for, their copy of the demo when they ask to be
 * shown around, and a welcome email that says what to do next. Nothing is made for them unasked.
 */

const INTENTS: OnboardingIntent[] = ['agency', 'own', 'developer', 'team'];

/** Change what someone said they came for, what they're called, or mark the welcome screens done. */
export async function updateOnboarding(
    userId: string,
    patch: { intent?: unknown; finished?: unknown; name?: unknown }
): Promise<OnboardingState> {
    const name = typeof patch.name === 'string' ? patch.name.trim().slice(0, 120) : undefined;
    if (patch.intent !== undefined && !INTENTS.includes(patch.intent as OnboardingIntent))
        throw Object.assign(new Error(`intent must be one of ${INTENTS.join(', ')}.`), {
            status: 400
        });
    const saved = await updateStoredUser(userId, user => {
        const next: OnboardingState = { ...user.onboarding };
        if (patch.intent !== undefined) next.intent = patch.intent as OnboardingIntent;
        if (patch.finished === true) next.finishedAt = new Date().toISOString();
        return { ...user, ...(name && { name }), onboarding: next };
    });
    return saved.onboarding ?? {};
}

/** Copies a person may make in all (deleting one and asking again counts). */
const DEMO_COPIES = 3;
/** One copy at a time per person: asking twice at once gives one copy. */
const copying = new Map<string, Promise<string>>();

/**
 * Their own copy of the demo project, made the first time they ask to be shown around. Asking
 * again gives the same one back. Throws when this server names no demo (`DEMO_PROJECT_ID`).
 */
export function demoProjectFor(userId: string): Promise<string> {
    const running = copying.get(userId);
    if (running) return running;
    const work = copyDemo(userId).finally(() => copying.delete(userId));
    copying.set(userId, work);
    return work;
}

async function copyDemo(userId: string): Promise<string> {
    const user = getUserById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    const existing = user.onboarding?.demoProjectId;
    if (existing && isExistingProjectId(existing)) return existing;
    // Only a project the server names as its demo (DEMO_PROJECT_ID), never one that happens to be
    // called "demo".
    const source = process.env.DEMO_PROJECT_ID?.trim() ? getDemoProjectId() : '';
    if (!source || !isExistingProjectId(source))
        throw Object.assign(new Error('This server has no demo project.'), {
            status: 404,
            code: 'NO_DEMO'
        });
    const made = user.onboarding?.demoCopies ?? 0;
    if (made >= DEMO_COPIES)
        throw Object.assign(new Error('You have made all the demo copies you can.'), {
            status: 429,
            code: 'DEMO_LIMIT'
        });
    const short = userId.replace(/^user:/, '').slice(0, 8);
    let id = `demo-${short}`;
    for (let n = 2; isExistingProjectId(id); n++) id = `demo-${short}-${n}`;
    // Counted before the copy: a copy that fails half-way still counts.
    await updateStoredUser(userId, u => ({
        ...u,
        onboarding: { ...u.onboarding, demoProjectId: id, demoCopies: made + 1 }
    }));
    await copyProjectForNewUser(source, id, userId);
    return id;
}

/** A first email that says what to do this week. Never fails the sign-up. */
export async function sendWelcome(user: User): Promise<void> {
    if (!user.email || emailUnavailable()) return;
    const name = user.name?.split(' ')[0] || user.email.split('@')[0];
    const email = renderEmail(
        'welcome',
        { email: user.email, name, studioUrl: studioUrl() },
        readerOf(user)
    );
    await sendEmail({
        to: [user.email],
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: email.attachments,
        category: 'auth'
    }).catch(() => undefined);
}

import type { OnboardingIntent, OnboardingState, User } from '@moteurio/types/User.js';
import { copyProjectForNewUser, getDemoProjectId } from './projects.js';
import { getUserById, updateStoredUser } from './users.js';
import { isExistingProjectId } from './utils/fileUtils.js';
import { emailUnavailable, sendEmail } from './emailNotifier.js';

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

/** The Studio's address, for links in emails (`STUDIO_URL`), when the server knows it. */
function studioUrl(): string | undefined {
    const url = process.env.STUDIO_URL?.trim().replace(/\/+$/, '');
    return url && /^https?:\/\//.test(url) ? url : undefined;
}

/** A first email that says what to do this week. Never fails the sign-up. */
export async function sendWelcome(user: User): Promise<void> {
    if (!user.email || emailUnavailable()) return;
    const fr = user.signup?.locale?.toLowerCase().startsWith('fr');
    const name = user.name?.split(' ')[0] || user.email.split('@')[0];
    const studio = studioUrl();
    const link = (path: string) => (studio ? `\n   ${studio}${path}` : '');
    const text = fr
        ? [
              `Bonjour ${name},`,
              '',
              'Votre compte Moteur est prêt. Trois choses à faire cette semaine :',
              '',
              `1. Créez le projet de votre premier client, et ses langues.${link('/projects/new')}`,
              '2. Invitez l’équipe du client : chacun son rôle, et rien qu’il puisse briser.',
              '3. Branchez le site : un canal, une clé qui ne fait que lire, et c’est parti.',
              '',
              'Chaque enregistrement devient un commit. Rien n’est perdu, et tout vous appartient.',
              '',
              'L’équipe Moteur'
          ]
        : [
              `Hi ${name},`,
              '',
              'Your Moteur account is ready. Three things worth doing this week:',
              '',
              `1. Start your first client's project, in their languages.${link('/projects/new')}`,
              "2. Invite the client's team: each with their role, and nothing they can break.",
              "3. Connect the site: a channel, a key that only reads, and you're reading content.",
              '',
              'Every save becomes a commit. Nothing is lost, and all of it is yours.',
              '',
              'The Moteur team'
          ];
    await sendEmail({
        to: [user.email],
        subject: fr ? 'Bienvenue dans Moteur' : 'Welcome to Moteur',
        text: text.join('\n')
    }).catch(() => undefined);
}

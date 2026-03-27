import { User } from '@moteurio/types/User.js';
import { sendWelcomeEmail } from '@moteurio/core/emailNotifier.js';
import { getDemoProjectId, copyProjectForNewUser } from '@moteurio/core/projects.js';
import { isExistingProjectId } from '@moteurio/core/utils/fileUtils.js';

/**
 * Runs onboarding for a newly created user: welcome email and a copy of the demo project.
 * Non-blocking; logs errors but does not throw so auth flow is not broken.
 */
export async function runOnboardingForNewUser(user: User): Promise<void> {
    try {
        await sendWelcomeEmail(user);
    } catch (err) {
        console.error('[Onboarding] Welcome email failed:', err);
    }

    const demoId = getDemoProjectId();
    if (!demoId || !isExistingProjectId(demoId)) {
        return;
    }

    const shortId = user.id.replace(/^user:/, '').slice(0, 8);
    const newProjectId = `demo-${shortId}`;

    try {
        await copyProjectForNewUser(demoId, newProjectId, user.id);
    } catch (err) {
        console.error('[Onboarding] Demo project copy failed:', err);
    }
}

import { User } from '@moteurio/types/User.js';
import { sendWelcome } from '@moteurio/core/onboarding.js';

/**
 * Runs once for a new account: the welcome email. Nothing else is made for them: the Studio's
 * welcome screens ask what they came for, and copy the demo only if they want to be shown around.
 * Never throws, so signing up never fails because of it.
 */
export async function runOnboardingForNewUser(user: User): Promise<void> {
    try {
        await sendWelcome(user);
    } catch (err) {
        console.error('[Onboarding] Welcome email failed:', err);
    }
}

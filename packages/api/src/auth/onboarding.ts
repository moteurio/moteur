import { User } from '@moteurio/types/User.js';
import { sendWelcome, type JoinedBy } from '@moteurio/core/onboarding.js';
import type { EmailLook } from '@moteurio/core/email/settings.js';

/**
 * Runs once for a new account: the welcome email. Nothing else is made for them: the Studio's
 * welcome screens ask what they came for, and copy the demo only if they want to be shown around.
 * Never throws, so signing up never fails because of it.
 */
export async function runOnboardingForNewUser(
    user: User,
    joined?: JoinedBy,
    /** The look of the page they signed up on, for the welcome only; never stored. */
    page: { look?: EmailLook } = {}
): Promise<void> {
    try {
        await sendWelcome(user, joined, page);
    } catch (err) {
        console.error('[Onboarding] Welcome email failed:', err);
    }
}

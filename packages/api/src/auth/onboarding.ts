import { User } from '@moteurio/types/User.js';
import { sendWelcome, type JoinedBy } from '@moteurio/core/onboarding.js';
import type { EmailLook } from '@moteurio/core/email/settings.js';

/**
 * Runs once for a new account and sends the welcome email. Nothing else is created for the user
 * here: admin clients ask what they came for and copy the demo only if they want a tour.
 * Never throws, so a failed email cannot make signing up fail.
 */
export async function runOnboardingForNewUser(
    user: User,
    joined?: JoinedBy,
    /** The look of the page the user signed up on. Used for the welcome email only and never stored. */
    page: { look?: EmailLook } = {}
): Promise<void> {
    try {
        await sendWelcome(user, joined, page);
    } catch (err) {
        console.error('[Onboarding] Welcome email failed:', err);
    }
}

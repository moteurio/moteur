import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@moteurio/core/onboarding.js', () => ({
    sendWelcome: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@moteurio/core/projects.js', () => ({
    copyProjectForNewUser: vi.fn().mockResolvedValue(undefined)
}));

import { runOnboardingForNewUser } from '../../src/auth/onboarding';
import { sendWelcome } from '@moteurio/core/onboarding.js';
import { copyProjectForNewUser } from '@moteurio/core/projects.js';

const mockUser = {
    id: 'user:abc12345',
    isActive: true,
    email: 'new@example.com',
    name: 'New User',
    roles: [],
    projects: []
};

describe('runOnboardingForNewUser', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sends the welcome email, and makes nothing unasked', async () => {
        await runOnboardingForNewUser(mockUser as any);
        expect(sendWelcome).toHaveBeenCalledWith(mockUser, undefined);
        // The demo is copied only when they ask to be shown around.
        expect(copyProjectForNewUser).not.toHaveBeenCalled();
    });

    it('never fails the sign-up when the email fails', async () => {
        (sendWelcome as any).mockRejectedValueOnce(new Error('SMTP fail'));
        await expect(runOnboardingForNewUser(mockUser as any)).resolves.toBeUndefined();
    });
});

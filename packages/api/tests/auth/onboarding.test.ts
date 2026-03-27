import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@moteurio/core/emailNotifier', () => ({
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@moteurio/core/projects', () => ({
    getDemoProjectId: vi.fn().mockReturnValue('demo'),
    copyProjectForNewUser: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@moteurio/core/utils/fileUtils', () => ({
    isExistingProjectId: vi.fn().mockReturnValue(true)
}));

import { runOnboardingForNewUser } from '../../src/auth/onboarding';
import { sendWelcomeEmail } from '@moteurio/core/emailNotifier';
import { getDemoProjectId, copyProjectForNewUser } from '@moteurio/core/projects';
import { isExistingProjectId } from '@moteurio/core/utils/fileUtils';

const mockUser = {
    id: 'user:abc12345',
    isActive: true,
    email: 'new@example.com',
    name: 'New User',
    roles: ['user'],
    projects: []
};

describe('runOnboardingForNewUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getDemoProjectId as any).mockReturnValue('demo');
        (isExistingProjectId as any).mockReturnValue(true);
        (copyProjectForNewUser as any).mockResolvedValue(undefined);
    });

    it('calls sendWelcomeEmail with the user', async () => {
        await runOnboardingForNewUser(mockUser as any);
        expect(sendWelcomeEmail).toHaveBeenCalledWith(mockUser);
    });

    it('calls copyProjectForNewUser when demo project exists', async () => {
        await runOnboardingForNewUser(mockUser as any);
        expect(getDemoProjectId).toHaveBeenCalled();
        expect(isExistingProjectId).toHaveBeenCalledWith('demo');
        expect(copyProjectForNewUser).toHaveBeenCalledWith(
            'demo',
            'demo-abc12345',
            'user:abc12345'
        );
    });

    it('skips copy when demo project does not exist', async () => {
        (isExistingProjectId as any).mockReturnValue(false);
        await runOnboardingForNewUser(mockUser as any);
        expect(sendWelcomeEmail).toHaveBeenCalled();
        expect(copyProjectForNewUser).not.toHaveBeenCalled();
    });

    it('does not throw when sendWelcomeEmail fails', async () => {
        (sendWelcomeEmail as any).mockRejectedValueOnce(new Error('SMTP fail'));
        await expect(runOnboardingForNewUser(mockUser as any)).resolves.toBeUndefined();
    });

    it('does not throw when copyProjectForNewUser fails', async () => {
        (copyProjectForNewUser as any).mockRejectedValueOnce(new Error('Copy fail'));
        await expect(runOnboardingForNewUser(mockUser as any)).resolves.toBeUndefined();
    });
});

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenAccount } from '../../../src/ui/screens/ScreenAccount.js';

describe('ScreenAccount', () => {
    it('shows logout message for account_logout', () => {
        const { lastFrame } = render(
            <ScreenAccount screen="account_logout" loggedIn={true} whoami={null} />
        );
        expect(lastFrame()).toContain('Logout');
        expect(lastFrame()).toContain('sign out');
    });

    it('shows not logged in and auth hint when loggedIn false', () => {
        const { lastFrame } = render(
            <ScreenAccount screen="account_whoami" loggedIn={false} whoami={null} />
        );
        const output = lastFrame();
        expect(output).toContain('Not logged in');
        expect(output).toContain('moteur auth login');
    });

    it('shows whoami content when logged in with whoami data', () => {
        const { lastFrame } = render(
            <ScreenAccount
                screen="account_whoami"
                loggedIn={true}
                whoami={{ id: 'u1', email: 'u@example.com', name: 'User' }}
            />
        );
        const output = lastFrame();
        expect(output).toContain('Who am I');
        expect(output).toContain('u@example.com');
        expect(output).toContain('User');
    });

    it('shows failed to load when whoami is null and logged in', () => {
        const { lastFrame } = render(
            <ScreenAccount screen="account_whoami" loggedIn={true} whoami={null} />
        );
        expect(lastFrame()).toContain('Failed to load user');
    });

    it('shows loading when whoami is empty object (loading state)', () => {
        const { lastFrame } = render(
            <ScreenAccount screen="account_whoami" loggedIn={true} whoami={{}} />
        );
        expect(lastFrame()).toContain('Loading');
    });
});

import type { MoteurClient } from '../client.js';
import type { LoginResult, SignedIn } from '../types.js';
import type { OnboardingIntent, OnboardingState, User } from '@moteurio/types';

export function authApi(client: MoteurClient) {
    return {
        login(username: string, password: string): Promise<LoginResult> {
            return client.post<LoginResult>('/auth/login', { username, password });
        },
        /** The second step of signing in: the ticket `login` gave, and a code (or a recovery code). */
        verifyTwoFactor(
            ticket: string,
            code: string
        ): Promise<SignedIn & { usedRecovery: boolean }> {
            return client.post('/auth/two-factor/verify', { ticket, code });
        },
        /** The signed-in person's two-step sign-in. */
        twoFactor: {
            status(): Promise<{ enabled: boolean; recoveryCodesLeft?: number }> {
                return client.get('/auth/two-factor');
            },
            /** A secret to scan (`qr` is an SVG); it turns on with `enable` and a first code. */
            setup(): Promise<{ secret: string; otpauth: string; qr: string }> {
                return client.post('/auth/two-factor/setup');
            },
            enable(code: string): Promise<{ recoveryCodes: string[] }> {
                return client.post('/auth/two-factor/enable', { code });
            },
            disable(code: string): Promise<{ enabled: false }> {
                return client.post('/auth/two-factor/disable', { code });
            },
            renewRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
                return client.post('/auth/two-factor/recovery-codes', { code });
            }
        },
        me(): Promise<{ user: User }> {
            return client.get('/auth/me');
        },
        refresh(): Promise<{ token: string }> {
            return client.post<{ token: string }>('/auth/refresh');
        },
        /** Whether this server takes new accounts, and can send codes by email. */
        signup(): Promise<{ open: boolean; emailCodes: boolean }> {
            return client.get('/auth/signup');
        },
        /**
         * Email a six-digit code: to sign in if the address has an account, to sign up if not (on
         * an open server). Answers the same either way. `from`, `goal` and `campaign` say what
         * brought them, and stay on a new account.
         */
        emailCode(input: {
            email: string;
            from?: string;
            goal?: string;
            campaign?: Record<string, string>;
            locale?: string;
        }): Promise<{ sent: true }> {
            return client.post('/auth/email/code', input);
        },
        /**
         * Trade the code, or the email link's `token`, for a session (`isNew` for a new account),
         * or a two-step ticket.
         */
        verifyEmailCode(input: {
            email: string;
            code?: string;
            token?: string;
            name?: string;
        }): Promise<{ token: string; isNew: boolean } | { twoFactor: true; ticket: string }> {
            return client.post('/auth/email/verify', input);
        },
        /** Say what you came for and what to call you, or that the welcome screens are done. */
        onboarding(patch: {
            intent?: OnboardingIntent;
            name?: string;
            finished?: boolean;
        }): Promise<{ onboarding: OnboardingState }> {
            return client.patch('/auth/me/onboarding', patch);
        },
        /** Your copy of the demo project, made the first time you ask. */
        demo(): Promise<{ projectId: string }> {
            return client.post('/auth/me/demo');
        },
        /** OAuth providers the server can sign in with; send people to `/auth/{id}?next=…`. */
        providers(): Promise<{ providers: { id: string; label: string }[] }> {
            return client.get('/auth/providers');
        }
    };
}

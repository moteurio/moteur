import type { MoteurClient } from '../client.js';
import type { LoginResult, SignedIn } from '../types.js';
import type {
    OnboardingIntent,
    OnboardingState,
    PasskeyAuthenticationJSON,
    PasskeyCreationOptionsJSON,
    PasskeyRegistrationJSON,
    PasskeyRequestOptionsJSON,
    PasskeySummary,
    User
} from '@moteurio/types';

type ProjectRef = { id: string; name: string };

/** What deleting an account would do: projects deleted with it, left, or in the way. */
export type AccountDeletion = {
    deletes: ProjectRef[];
    leaves: ProjectRef[];
    blocked: ProjectRef[];
};

/** Everything the server keeps about the signed-in person (`GET /auth/me/export`). */
export type AccountExport = {
    exportedAt: string;
    account: Record<string, unknown>;
    signIn: { password: boolean; providers: string[]; twoFactor: boolean };
    sessions: {
        id: string;
        label: string;
        kind: string;
        createdAt: string;
        expiresAt: string;
        current: boolean;
    }[];
    projects: (ProjectRef & { roles: string[] })[];
    activity: Record<string, unknown>[];
};

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
        /**
         * Passkeys. Signing in: `options` for `navigator.credentials.get()`, then `verify` with the
         * browser's answer (`PublicKeyCredential.toJSON()`, or `@simplewebauthn/browser`'s). No
         * two-step code follows a passkey. The rest is the signed-in person's own: adding and
         * removing need a sign-in from the last 10 minutes (else 403 `REAUTH_REQUIRED`).
         */
        passkeys: {
            /**
             * Start signing in. Nothing: any passkey for this server (and the browser's autofill,
             * `mediation: 'conditional'`). `email`: only that account's. `ticket`: the two-step
             * ticket after a password or an email code, a passkey standing in for the app code.
             * A challenge lasts five minutes; ask again after that.
             */
            signInOptions(
                input: { email?: string; ticket?: string } = {}
            ): Promise<{ options: PasskeyRequestOptionsJSON }> {
                return client.post('/auth/passkeys/sign-in/options', input);
            },
            /** The browser's signed answer: a session. */
            signIn(response: PasskeyAuthenticationJSON): Promise<SignedIn> {
                return client.post('/auth/passkeys/sign-in/verify', { response });
            },
            /** The person's passkeys, and whether this server offers them. */
            list(): Promise<{ available: boolean; passkeys: PasskeySummary[] }> {
                return client.get('/auth/passkeys');
            },
            /** Start adding one: `options` for `navigator.credentials.create()`. */
            registrationOptions(): Promise<{ options: PasskeyCreationOptionsJSON }> {
                return client.post('/auth/passkeys/register/options');
            },
            /** Finish adding it with the browser's answer; `name` defaults to where it lives. */
            register(
                response: PasskeyRegistrationJSON,
                name?: string
            ): Promise<{ passkey: PasskeySummary }> {
                return client.post('/auth/passkeys/register/verify', {
                    response,
                    ...(name !== undefined && { name })
                });
            },
            rename(passkeyId: string, name: string): Promise<{ passkey: PasskeySummary }> {
                return client.patch(`/auth/passkeys/${encodeURIComponent(passkeyId)}`, { name });
            },
            /** Remove one. Other sessions end: keep the replacement `token` it answers. */
            remove(passkeyId: string): Promise<{ token: string }> {
                return client.delete(`/auth/passkeys/${encodeURIComponent(passkeyId)}`);
            }
        },
        me(): Promise<{ user: User }> {
            return client.get('/auth/me');
        },
        refresh(): Promise<{ token: string }> {
            return client.post<{ token: string }>('/auth/refresh');
        },
        /**
         * Whether this server takes new accounts, can send codes by email, offers passkeys, and
         * where its Terms and Privacy policy are (`legal`: a key is absent when the server has none).
         */
        signup(): Promise<{
            open: boolean;
            emailCodes: boolean;
            passkeys: boolean;
            legal: { terms?: string; privacy?: string };
        }> {
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
        /**
         * Email a code to a new sign-in address (a sign-in in the last 10 minutes, else 403
         * `REAUTH_REQUIRED`). `confirmEmailChange` with that code makes the change.
         */
        changeEmail(email: string, locale?: string): Promise<{ sent: true }> {
            return client.post('/auth/me/email', { email, ...(locale && { locale }) });
        },
        /**
         * The new address and its code: it becomes the sign-in email. Other sessions end; use the
         * answer's `token` from now on (call `setAuth` with it).
         */
        confirmEmailChange(email: string, code: string): Promise<{ token: string; user: User }> {
            return client.post('/auth/me/email/verify', { email, code });
        },
        /** What the server keeps about you, as the file `GET /auth/me/export` downloads. */
        exportAccount(): Promise<AccountExport> {
            return client.get('/auth/me/export');
        },
        /** What deleting your account would do to each of your projects. */
        accountDeletion(): Promise<AccountDeletion> {
            return client.get('/auth/me/deletion');
        },
        /**
         * Delete your account, your sign-in email typed back as `email` (a sign-in in the last 10
         * minutes). Refused (409 `SOLE_ADMIN`, with `projects`) while `accountDeletion().blocked`
         * isn't empty.
         */
        deleteAccount(email: string): Promise<void> {
            return client.request({ method: 'DELETE', url: '/auth/me', data: { email } });
        },
        /** OAuth providers the server can sign in with; send people to `/auth/{id}?next=…`. */
        providers(): Promise<{ providers: { id: string; label: string }[] }> {
            return client.get('/auth/providers');
        }
    };
}

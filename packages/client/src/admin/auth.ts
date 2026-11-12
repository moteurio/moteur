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
    User,
    WorkspaceAccess,
    WorkspaceRole
} from '@moteurio/types';

type ProjectRef = { id: string; name: string };

/** The effects of deleting an account: projects that would be deleted with it, projects the user would leave, and projects that block the deletion. */
export type AccountDeletion = {
    deletes: ProjectRef[];
    leaves: ProjectRef[];
    blocked: ProjectRef[];
    /** The same breakdown for workspaces. `blocked` lists the workspaces where the user is the only owner. */
    workspaces: { deletes: ProjectRef[]; leaves: ProjectRef[]; blocked: ProjectRef[] };
};

/** All the data the server stores about the signed-in user, as returned by `GET /auth/me/export`. */
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
    workspaces: (ProjectRef & { role: WorkspaceRole })[];
    activity: Record<string, unknown>[];
};

/** A workspace the signed-in user belongs to, as listed by `me()`. */
export type MyWorkspace = {
    id: string;
    name: string;
    personal: boolean;
    role: WorkspaceRole;
    /** The user's access level. Present for Members: every project of the workspace, or only those they were added to. */
    access?: WorkspaceAccess;
    /** The user's roles in every project. Present for Members with access to every project. */
    projectRoles?: string[];
};

export function authApi(client: MoteurClient) {
    return {
        login(username: string, password: string): Promise<LoginResult> {
            return client.post<LoginResult>('/auth/login', { username, password });
        },
        /** Completes sign-in with two-factor authentication. Takes the ticket returned by `login` and an authentication code or a recovery code. */
        verifyTwoFactor(
            ticket: string,
            code: string
        ): Promise<SignedIn & { usedRecovery: boolean }> {
            return client.post('/auth/two-factor/verify', { ticket, code });
        },
        /** Manages two-factor authentication for the signed-in user. */
        twoFactor: {
            status(): Promise<{ enabled: boolean; recoveryCodesLeft?: number }> {
                return client.get('/auth/two-factor');
            },
            /** Starts two-factor setup by returning a secret to scan (`qr` is an SVG). Two-factor authentication is turned on by calling `enable` with a first valid code. */
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
         * Passkey sign-in and management. To sign in, call `signInOptions` to get the options for
         * `navigator.credentials.get()`, then call `signIn` with the browser's response
         * (`PublicKeyCredential.toJSON()`, or the equivalent from `@simplewebauthn/browser`). A
         * passkey sign-in does not require a two-factor code afterwards. The remaining methods
         * manage the signed-in user's own passkeys. Adding and removing a passkey require a sign-in
         * within the last 10 minutes, otherwise the API responds with 403 `REAUTH_REQUIRED`.
         */
        passkeys: {
            /**
             * Starts a passkey sign-in. With no input, any passkey registered on this server is
             * accepted, including through the browser's autofill (`mediation: 'conditional'`).
             * With `email`, only that account's passkeys are accepted. With `ticket`, the
             * two-factor ticket issued after a password or email code, a passkey is accepted in
             * place of the authenticator app code. A challenge is valid for five minutes, after
             * which a new one must be requested.
             */
            signInOptions(
                input: { email?: string; ticket?: string } = {}
            ): Promise<{ options: PasskeyRequestOptionsJSON }> {
                return client.post('/auth/passkeys/sign-in/options', input);
            },
            /** Completes the sign-in with the browser's signed response and returns a session. */
            signIn(response: PasskeyAuthenticationJSON): Promise<SignedIn> {
                return client.post('/auth/passkeys/sign-in/verify', { response });
            },
            /** Lists the user's passkeys, and reports whether this server supports passkeys. */
            list(): Promise<{ available: boolean; passkeys: PasskeySummary[] }> {
                return client.get('/auth/passkeys');
            },
            /** Starts registering a passkey by returning the options for `navigator.credentials.create()`. */
            registrationOptions(): Promise<{ options: PasskeyCreationOptionsJSON }> {
                return client.post('/auth/passkeys/register/options');
            },
            /** Completes registration with the browser's response. `name` defaults to a description of where the passkey is stored. */
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
            /** Removes a passkey. This ends the user's other sessions, so use the replacement `token` in the response from now on. */
            remove(passkeyId: string): Promise<{ token: string }> {
                return client.delete(`/auth/passkeys/${encodeURIComponent(passkeyId)}`);
            }
        },
        /** Returns the signed-in user with their projects and the workspaces they belong to. */
        me(): Promise<{ user: User & { workspaces: MyWorkspace[] } }> {
            return client.get('/auth/me');
        },
        refresh(): Promise<{ token: string }> {
            return client.post<{ token: string }>('/auth/refresh');
        },
        /**
         * Reports whether the server accepts new accounts (`open`), can send codes by email,
         * supports passkeys, and where its Terms and Privacy policy are. A key in `legal` is
         * absent when the server has no such document.
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
         * Emails a six-digit code. The code signs the user in if the address has an account, and
         * signs them up if it does not (on an open server). The response is the same in both
         * cases. `from`, `goal` and `campaign` record what led the user here and are stored on a
         * new account. `look` is the theme of the page making the request; the email is rendered
         * in that theme, and the value is not stored.
         */
        emailCode(input: {
            email: string;
            from?: string;
            goal?: string;
            campaign?: Record<string, string>;
            locale?: string;
            look?: 'discotheque' | 'folio';
        }): Promise<{ sent: true }> {
            return client.post('/auth/email/code', input);
        },
        /**
         * Exchanges the emailed code, or the `token` from the email link, for a session. The
         * response has `isNew` set for a newly created account. When the account has two-factor
         * authentication, it returns a two-factor ticket instead.
         */
        verifyEmailCode(input: {
            email: string;
            code?: string;
            token?: string;
            name?: string;
            /** Theme of the page making the request. The welcome email for a new account is rendered in it. The value is not stored. */
            look?: 'discotheque' | 'folio';
        }): Promise<{ token: string; isNew: boolean } | { twoFactor: true; ticket: string }> {
            return client.post('/auth/email/verify', input);
        },
        /** Records the user's stated purpose and name, or that they have finished onboarding. */
        onboarding(patch: {
            intent?: OnboardingIntent;
            name?: string;
            finished?: boolean;
        }): Promise<{ onboarding: OnboardingState }> {
            return client.patch('/auth/me/onboarding', patch);
        },
        /**
         * Updates the user's theme, language and notification email preferences, which the server's
         * emails follow. Passing null for `look` or `locale` clears it.
         */
        preferences(patch: {
            look?: 'discotheque' | 'folio' | null;
            locale?: string | null;
            emails?: { reviews?: boolean };
        }): Promise<{ preferences: NonNullable<User['preferences']> }> {
            return client.patch('/auth/me/preferences', patch);
        },
        /** Returns the user's copy of the demo project. The copy is created the first time this is called. */
        demo(): Promise<{ projectId: string }> {
            return client.post('/auth/me/demo');
        },
        /**
         * Emails a code to the new sign-in address. Requires a sign-in within the last 10 minutes,
         * otherwise the API responds with 403 `REAUTH_REQUIRED`. Call `confirmEmailChange` with the
         * code to complete the change.
         */
        changeEmail(email: string, locale?: string): Promise<{ sent: true }> {
            return client.post('/auth/me/email', { email, ...(locale && { locale }) });
        },
        /**
         * Confirms the new address with its code, and makes it the sign-in email. This ends the
         * user's other sessions, so call `setAuth` with the `token` in the response.
         */
        confirmEmailChange(email: string, code: string): Promise<{ token: string; user: User }> {
            return client.post('/auth/me/email/verify', { email, code });
        },
        /** Returns all the data the server stores about the user, as downloaded by `GET /auth/me/export`. */
        exportAccount(): Promise<AccountExport> {
            return client.get('/auth/me/export');
        },
        /** Returns what deleting the account would do to each of the user's projects and workspaces. */
        accountDeletion(): Promise<AccountDeletion> {
            return client.get('/auth/me/deletion');
        },
        /**
         * Deletes the account. `email` must repeat the user's sign-in email, and the user must have
         * signed in within the last 10 minutes. The request is refused with 409 `SOLE_ADMIN` (with
         * `projects`) while `accountDeletion().blocked` is not empty, and with 409 `SOLE_OWNER`
         * (with `workspaces`) while `accountDeletion().workspaces.blocked` is not empty.
         */
        deleteAccount(email: string): Promise<void> {
            return client.request({ method: 'DELETE', url: '/auth/me', data: { email } });
        },
        /** Lists the OAuth providers the server supports. Send users to `/auth/{id}?next=…` to sign in with one. */
        providers(): Promise<{ providers: { id: string; label: string }[] }> {
            return client.get('/auth/providers');
        }
    };
}

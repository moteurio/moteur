import type { MoteurClient } from '../client.js';
import type { LoginResult, SignedIn } from '../types.js';
import type { User } from '@moteurio/types';

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
        /** OAuth providers the server can sign in with; send people to `/auth/{id}?next=…`. */
        providers(): Promise<{ providers: { id: string; label: string }[] }> {
            return client.get('/auth/providers');
        }
    };
}

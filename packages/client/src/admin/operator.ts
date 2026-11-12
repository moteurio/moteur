import type { MoteurClient } from '../client.js';

type SchemaKind = 'blocks' | 'structures';

/** Server settings, either saved by an operator or provided by the environment (`MOTEUR_TERMS_URL`, `MOTEUR_PRIVACY_URL`). */
export type ServerSettings = { termsUrl?: string; privacyUrl?: string };

/**
 * Server-wide administration for operators: every project, account and plugin, plus the
 * server-wide blocks and structures. Requires an account with the `admin` role.
 */
export function operatorApi(client: MoteurClient) {
    return {
        summary(): Promise<Record<string, unknown>> {
            return client.get('/operator/summary');
        },
        projects: {
            list(): Promise<{ projects: Record<string, unknown>[] }> {
                return client.get('/operator/projects');
            },
            setPlugins(
                projectId: string,
                plugins: string[] | null
            ): Promise<{ project: Record<string, unknown> }> {
                return client.patch(`/operator/projects/${encodeURIComponent(projectId)}`, {
                    plugins
                });
            }
        },
        workspaces: {
            list(): Promise<{ workspaces: Record<string, unknown>[] }> {
                return client.get('/operator/workspaces');
            }
        },
        users: {
            list(): Promise<{ users: Record<string, unknown>[] }> {
                return client.get('/operator/users');
            },
            update(
                userId: string,
                body: Record<string, unknown>
            ): Promise<{ user: Record<string, unknown> }> {
                return client.patch(`/operator/users/${encodeURIComponent(userId)}`, body);
            },
            /** Creates an account. Without a password, the person signs in with an email code. */
            create(body: {
                email: string;
                name: string;
                password?: string;
                projectId?: string;
                roles?: string[];
            }): Promise<{ user: Record<string, unknown> }> {
                return client.post('/operator/users', body);
            },
            /** Sets an account's password and ends all of its sessions. */
            setPassword(
                userId: string,
                password: string
            ): Promise<{ user: Record<string, unknown> }> {
                return client.put(`/operator/users/${encodeURIComponent(userId)}/password`, {
                    password
                });
            }
        },
        plugins: {
            list(): Promise<{ plugins: Record<string, unknown>[] }> {
                return client.get('/operator/plugins');
            },
            set(
                pluginId: string,
                on: boolean | null
            ): Promise<{ plugin: Record<string, unknown> }> {
                return client.patch(`/operator/plugins/${encodeURIComponent(pluginId)}`, { on });
            }
        },
        /** Server-wide settings: the URLs of the Terms and the Privacy policy. */
        settings: {
            get(): Promise<{ settings: ServerSettings; env: ServerSettings }> {
                return client.get('/operator/settings');
            },
            /** A string sets a URL (an https address). Null clears it, so the value from the environment applies. */
            update(patch: {
                termsUrl?: string | null;
                privacyUrl?: string | null;
            }): Promise<{ settings: ServerSettings; env: ServerSettings }> {
                return client.patch('/operator/settings', patch);
            }
        },
        schemas: {
            list(kind: SchemaKind): Promise<{ items: Record<string, unknown>[] }> {
                return client.get(`/operator/schemas/${kind}`);
            },
            save(
                kind: SchemaKind,
                name: string,
                schema: Record<string, unknown>
            ): Promise<{ item: Record<string, unknown> }> {
                return client.put(`/operator/schemas/${kind}/${encodeURIComponent(name)}`, schema);
            },
            delete(kind: SchemaKind, name: string): Promise<void> {
                return client.delete(`/operator/schemas/${kind}/${encodeURIComponent(name)}`);
            }
        },
        /** The server's email sender and appearance settings, and checks of whether receiving servers will trust its email. */
        email: {
            get(): Promise<Record<string, unknown>> {
                return client.get('/operator/email');
            },
            /** Updates any of the settings. Passing null resets a setting to its default. */
            update(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
                return client.patch('/operator/email', settings);
            },
            /** Checks the SMTP, SPF, DMARC, DKIM and MX configuration. With `to`, it also sends a test email. */
            check(body: { to?: string; selectors?: string[] } = {}): Promise<{
                checks: { id: string; status: string; message: string; found?: string }[];
                sent?: { to: string; messageId: string };
            }> {
                return client.post('/operator/email/check', body);
            }
        }
    };
}

import type { MoteurClient } from '../client.js';

type SchemaKind = 'blocks' | 'structures';

/** Saved by an operator, or given by the environment (`MOTEUR_TERMS_URL`, `MOTEUR_PRIVACY_URL`). */
export type ServerSettings = { termsUrl?: string; privacyUrl?: string };

/**
 * The operator's view of the whole server: every project, every account, every plugin,
 * and the server-wide blocks and structures. Requires an account with the `admin` role.
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
        users: {
            list(): Promise<{ users: Record<string, unknown>[] }> {
                return client.get('/operator/users');
            },
            update(
                userId: string,
                body: Record<string, unknown>
            ): Promise<{ user: Record<string, unknown> }> {
                return client.patch(`/operator/users/${encodeURIComponent(userId)}`, body);
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
        /** Settings for the whole server: where the Terms and the Privacy policy are. */
        settings: {
            get(): Promise<{ settings: ServerSettings; env: ServerSettings }> {
                return client.get('/operator/settings');
            },
            /** A string sets one (an https address); null clears it, so the environment's applies. */
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
        }
    };
}

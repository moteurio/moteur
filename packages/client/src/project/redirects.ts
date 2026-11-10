import type { Redirect, RedirectStatus } from '@moteurio/types/Redirect.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/redirects`;

export type RedirectInput = { from: string; to: string; status?: RedirectStatus; note?: string };

/** Redirects from old paths to their destinations. Moteur also creates a redirect automatically when a published page or entry moves to a new URL. */
export function projectRedirectsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<Redirect[]> {
            return client.get(base(projectId));
        },
        create(projectId: string, body: RedirectInput): Promise<Redirect> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            redirectId: string,
            body: Partial<RedirectInput>
        ): Promise<Redirect> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(redirectId)}`, body);
        },
        delete(projectId: string, redirectId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(redirectId)}`);
        }
    };
}

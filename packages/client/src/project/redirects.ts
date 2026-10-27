import type { Redirect, RedirectStatus } from '@moteurio/types/Redirect.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/redirects`;

export type RedirectInput = { from: string; to: string; status?: RedirectStatus; note?: string };

/** Old addresses and where they go. Moteur adds one itself when a live page or entry moves. */
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

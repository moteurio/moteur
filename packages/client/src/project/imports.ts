/** Imports and exports (`/projects/:id/imports`, `/projects/:id/export`). */
import type { ImportBundle, ImportJob } from '@moteurio/types/Import.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

export function projectImportsApi(client: MoteurClient) {
    return {
        /**
         * Imports a bundle, all of it or nothing. Answers with the job: finished (`done`,
         * `failed`, `awaiting_approval`), or still `running` after `wait` seconds (follow it with
         * `get`). A failed import is an answer, not an error: its `issues` say why.
         */
        run(
            projectId: string,
            bundle: ImportBundle,
            options: { dryRun?: boolean; wait?: number } = {}
        ): Promise<ImportJob> {
            return client.request<ImportJob>({
                method: 'POST',
                url: `${base(projectId)}/imports`,
                data: bundle,
                params: {
                    ...(options.dryRun && { dryRun: 1 }),
                    ...(options.wait !== undefined && { wait: options.wait })
                },
                validateStatus: status => (status >= 200 && status < 300) || status === 422
            });
        },
        list(projectId: string): Promise<ImportJob[]> {
            return client.get(`${base(projectId)}/imports`);
        },
        get(projectId: string, id: string): Promise<ImportJob> {
            return client.get(`${base(projectId)}/imports/${encodeURIComponent(id)}`);
        },
        /** Puts a waiting import live (a person who can publish). */
        approve(projectId: string, id: string): Promise<ImportJob> {
            return client.post(`${base(projectId)}/imports/${encodeURIComponent(id)}/approve`);
        },
        /** The project as a bundle, to import elsewhere. */
        export(projectId: string): Promise<ImportBundle> {
            return client.get(`${base(projectId)}/export`);
        }
    };
}

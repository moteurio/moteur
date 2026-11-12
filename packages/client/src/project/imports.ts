/** Imports and exports (`/projects/:id/imports`, `/projects/:id/export`). */
import type { ImportBundle, ImportJob } from '@moteurio/types/Import.js';
import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

export function projectImportsApi(client: MoteurClient) {
    return {
        /**
         * Imports a bundle as a single all-or-nothing operation. Resolves with the import job. The
         * job has either finished (`done`, `failed` or `awaiting_approval`) or is still `running`
         * after `wait` seconds, in which case follow it with `get`. A failed import is returned as
         * a result rather than thrown as an error, and its `issues` explain why it failed.
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
        /** Publishes an import that is awaiting approval. The caller must be allowed to publish. */
        approve(projectId: string, id: string): Promise<ImportJob> {
            return client.post(`${base(projectId)}/imports/${encodeURIComponent(id)}/approve`);
        },
        /**
         * Exports the project as a bundle that can be imported elsewhere. With `inlineFiles`, each
         * file is embedded as base64 instead of referenced by URL, which is needed when the
         * importing server cannot reach this one.
         */
        export(projectId: string, options: { inlineFiles?: boolean } = {}): Promise<ImportBundle> {
            return client.get(
                `${base(projectId)}/export`,
                options.inlineFiles ? { inlineFiles: 1 } : undefined
            );
        }
    };
}

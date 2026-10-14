import type { MoteurClient } from '../client.js';
import type { Entry } from '@moteurio/types';

export function entriesApi(client: MoteurClient) {
    return {
        list(
            projectId: string,
            modelId: string,
            params?: {
                /** Comma-separated statuses, e.g. `draft,in_review`. */
                status?: string;
                limit?: number;
                offset?: number | string;
                /** `id`, `createdAt`, `updatedAt` or `publishedAt`; prefix `-` for descending. */
                sort?: string;
            }
        ): Promise<{ entries: Entry[]; total: number }> {
            const q: Record<string, string | number> = {};
            if (params?.status) q.status = params.status;
            if (params?.limit != null) q.limit = params.limit;
            if (params?.offset != null && params.offset !== '') q.offset = params.offset;
            if (params?.sort) q.sort = params.sort;
            return client.get(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries`,
                q as Record<string, string>
            );
        },
        get(projectId: string, modelId: string, entryId: string): Promise<{ entry: Entry }> {
            return client.get(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`
            );
        },
        create(
            projectId: string,
            modelId: string,
            body: Record<string, unknown>
        ): Promise<{ entry: Entry }> {
            return client.post(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries`,
                body
            );
        },
        update(
            projectId: string,
            modelId: string,
            entryId: string,
            body: Record<string, unknown>
        ): Promise<{ entry: Entry }> {
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`,
                body
            );
        },
        delete(projectId: string, modelId: string, entryId: string): Promise<void> {
            return client.delete(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}`
            );
        },
        status(
            projectId: string,
            modelId: string,
            entryId: string,
            status: string
        ): Promise<{ entry: Record<string, unknown> }> {
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}/status`,
                { status }
            );
        },
        submitReview(
            projectId: string,
            modelId: string,
            entryId: string
        ): Promise<{ entry: Record<string, unknown> }> {
            return client.post(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entries/${encodeURIComponent(entryId)}/submit-review`
            );
        }
    };
}

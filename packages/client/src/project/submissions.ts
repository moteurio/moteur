import type { MoteurClient } from '../client.js';

const base = (projectId: string, formId: string) =>
    `/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions`;

export type SubmissionListParams = {
    /** `received`, `processed` or `spam`. */
    status?: string;
    /** Only submissions nobody has opened (spam left out). */
    unread?: boolean;
    offset?: number;
    /** At most 500. */
    limit?: number;
};

export type SubmissionListResult = {
    /** Newest first. */
    submissions: Record<string, unknown>[];
    total: number;
    unread: number;
};

export function projectSubmissionsApi(client: MoteurClient) {
    return {
        list(
            projectId: string,
            formId: string,
            params?: SubmissionListParams
        ): Promise<SubmissionListResult> {
            const query: Record<string, string> = {};
            if (params?.status) query.status = params.status;
            if (params?.unread) query.unread = '1';
            if (params?.offset) query.offset = String(params.offset);
            if (params?.limit !== undefined) query.limit = String(params.limit);
            return client.get(base(projectId, formId), query);
        },
        get(
            projectId: string,
            formId: string,
            submissionId: string
        ): Promise<{ submission: Record<string, unknown> }> {
            return client.get(`${base(projectId, formId)}/${encodeURIComponent(submissionId)}`);
        },
        /** Mark read or unread, spam or not spam. */
        update(
            projectId: string,
            formId: string,
            submissionId: string,
            patch: { read?: boolean; spam?: boolean }
        ): Promise<{ submission: Record<string, unknown> }> {
            return client.patch(
                `${base(projectId, formId)}/${encodeURIComponent(submissionId)}`,
                patch
            );
        },
        /** Every submission of the form, as CSV text (or a JSON string). */
        export(projectId: string, formId: string, format: 'csv' | 'json' = 'csv'): Promise<string> {
            return client.request<string>({
                method: 'GET',
                url: `${base(projectId, formId)}/export`,
                params: { format },
                responseType: 'text'
            });
        },
        delete(projectId: string, formId: string, submissionId: string): Promise<void> {
            return client.delete(`${base(projectId, formId)}/${encodeURIComponent(submissionId)}`);
        }
    };
}

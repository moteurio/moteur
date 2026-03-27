import type { MoteurClient } from '../client.js';

const base = (projectId: string, formId: string) =>
    `/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions`;

export function projectSubmissionsApi(client: MoteurClient) {
    return {
        list(
            projectId: string,
            formId: string,
            params?: { limit?: number; offset?: string }
        ): Promise<{ submissions: Record<string, unknown>[] }> {
            return client.get(base(projectId, formId), params as Record<string, string>);
        },
        get(
            projectId: string,
            formId: string,
            submissionId: string
        ): Promise<{ submission: Record<string, unknown> }> {
            return client.get(`${base(projectId, formId)}/${encodeURIComponent(submissionId)}`);
        },
        delete(projectId: string, formId: string, submissionId: string): Promise<void> {
            return client.delete(`${base(projectId, formId)}/${encodeURIComponent(submissionId)}`);
        }
    };
}

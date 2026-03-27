import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/forms`;

export function projectFormsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ forms: Record<string, unknown>[] }> {
            return client.get(base(projectId));
        },
        get(projectId: string, formId: string): Promise<{ form: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(formId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ form: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            formId: string,
            body: Record<string, unknown>
        ): Promise<{ form: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(formId)}`, body);
        },
        delete(projectId: string, formId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(formId)}`);
        }
    };
}

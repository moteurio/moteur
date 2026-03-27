import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/templates`;

export function projectTemplatesApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ templates: Record<string, unknown>[] }> {
            return client
                .get<
                    Record<string, unknown>[] | { templates: Record<string, unknown>[] }
                >(base(projectId))
                .then(data =>
                    Array.isArray(data)
                        ? { templates: data }
                        : (data as { templates: Record<string, unknown>[] })
                );
        },
        get(projectId: string, templateId: string): Promise<{ template: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(templateId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ template: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            templateId: string,
            body: Record<string, unknown>
        ): Promise<{ template: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(templateId)}`, body);
        },
        delete(projectId: string, templateId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(templateId)}`);
        }
    };
}

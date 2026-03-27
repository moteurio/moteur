import type { MoteurClient } from '../client.js';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/structures`;

export function projectStructuresApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ structures: Record<string, unknown>[] }> {
            return client
                .get<
                    Record<string, unknown>[] | { structures: Record<string, unknown>[] }
                >(base(projectId))
                .then(data =>
                    Array.isArray(data)
                        ? { structures: data }
                        : (data as { structures: Record<string, unknown>[] })
                );
        },
        get(
            projectId: string,
            structureId: string
        ): Promise<{ structure: Record<string, unknown> }> {
            return client.get(`${base(projectId)}/${encodeURIComponent(structureId)}`);
        },
        create(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ structure: Record<string, unknown> }> {
            return client.post(base(projectId), body);
        },
        update(
            projectId: string,
            structureId: string,
            body: Record<string, unknown>
        ): Promise<{ structure: Record<string, unknown> }> {
            return client.patch(`${base(projectId)}/${encodeURIComponent(structureId)}`, body);
        },
        delete(projectId: string, structureId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(structureId)}`);
        }
    };
}

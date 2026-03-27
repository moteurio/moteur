import type { MoteurClient } from '../client.js';
import type { ModelSchema } from '@moteurio/types';

export function modelsApi(client: MoteurClient) {
    return {
        list(projectId: string): Promise<{ models: ModelSchema[] }> {
            return client.get(`/projects/${encodeURIComponent(projectId)}/models`);
        },
        get(projectId: string, modelId: string): Promise<{ model: ModelSchema }> {
            return client.get(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`
            );
        },
        create(projectId: string, body: Record<string, unknown>): Promise<{ model: ModelSchema }> {
            return client.post(`/projects/${encodeURIComponent(projectId)}/models`, body);
        },
        update(
            projectId: string,
            modelId: string,
            body: Record<string, unknown>
        ): Promise<{ model: ModelSchema }> {
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`,
                body
            );
        },
        delete(projectId: string, modelId: string): Promise<void> {
            return client.delete(
                `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`
            );
        }
    };
}

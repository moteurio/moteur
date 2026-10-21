import { getModelSchema } from '@moteurio/core/models.js';
import { createSchemaRevisionRouter, schemaRevisionOpenApi } from '../schemaRevisions/mount.js';

const options = {
    kind: 'model' as const,
    idParam: 'modelId',
    openApiPath: '/projects/{projectId}/models/{modelId}',
    tag: 'Models',
    responseKey: 'model',
    assertExists: async (req: import('express').Request) => {
        const projectId = String(req.params.projectId);
        const modelId = String(req.params.modelId);
        await getModelSchema(req.user!, projectId, modelId);
    }
};

export const openapi = schemaRevisionOpenApi(options);
export default createSchemaRevisionRouter(options);

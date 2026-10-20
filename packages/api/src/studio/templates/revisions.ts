import { getTemplateWithAuth } from '@moteurio/core/templates.js';
import { createSchemaRevisionRouter, schemaRevisionOpenApi } from '../../schemaRevisions/mount.js';

const options = {
    kind: 'template' as const,
    idParam: 'id',
    openApiPath: '/projects/{projectId}/templates/{id}',
    tag: 'Templates',
    responseKey: 'template',
    assertExists: async (req: import('express').Request) => {
        const { projectId, id } = req.params as Record<string, string>;
        await getTemplateWithAuth(req.user!, projectId, id);
    }
};

export const revisionsOpenapi = schemaRevisionOpenApi(options);
export const revisionsRouter = createSchemaRevisionRouter(options);

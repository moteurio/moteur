import { getStructure } from '@moteurio/core/structures.js';
import { createSchemaRevisionRouter, schemaRevisionOpenApi } from '../../schemaRevisions/mount.js';

const options = {
    kind: 'structure' as const,
    idParam: 'id',
    openApiPath: '/projects/{projectId}/structures/{id}',
    tag: 'Structures',
    responseKey: 'structure',
    assertExists: async (req: import('express').Request) => {
        const { projectId, id } = req.params as Record<string, string>;
        await getStructure(id, projectId);
    }
};

export const revisionsOpenapi = schemaRevisionOpenApi(options);
export const revisionsRouter = createSchemaRevisionRouter(options);

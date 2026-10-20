import { getForm } from '@moteurio/core/forms.js';
import { createSchemaRevisionRouter, schemaRevisionOpenApi } from '../../schemaRevisions/mount.js';

const options = {
    kind: 'form' as const,
    idParam: 'formId',
    openApiPath: '/projects/{projectId}/forms/{formId}',
    tag: 'Forms',
    responseKey: 'form',
    assertExists: async (req: import('express').Request) => {
        const { projectId, formId } = req.params as Record<string, string>;
        await getForm(req.user!, projectId, formId);
    }
};

export const revisionsOpenapi = schemaRevisionOpenApi(options);
export const revisionsRouter = createSchemaRevisionRouter(options);

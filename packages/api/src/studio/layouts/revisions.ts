import { getLayout } from '@moteurio/core/layouts.js';
import { layoutKey } from '@moteurio/core/utils/storageKeys.js';
import {
    contentRevisionOpenApi,
    createContentRevisionRouter
} from '../../contentRevisions/mount.js';

const options = {
    idParam: 'layoutId',
    openApiPath: '/projects/{projectId}/layouts/{layoutId}',
    tag: 'Layouts',
    responseKey: 'layout',
    gitPath: (_projectId: string, id: string) => layoutKey(id),
    assertExists: async (req: import('express').Request) => {
        const projectId = String(req.params.projectId);
        const layoutId = String(req.params.layoutId);
        await getLayout(req.user!, projectId, layoutId);
    }
};

export const revisionsOpenapi = contentRevisionOpenApi(options);
export const revisionsRouter = createContentRevisionRouter(options);

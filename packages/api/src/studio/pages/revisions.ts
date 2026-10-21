import { getPageWithAuth } from '@moteurio/core/pages.js';
import { pageKey } from '@moteurio/core/utils/storageKeys.js';
import {
    contentRevisionOpenApi,
    createContentRevisionRouter
} from '../../contentRevisions/mount.js';

const options = {
    idParam: 'id',
    openApiPath: '/projects/{projectId}/pages/{id}',
    tag: 'Pages',
    responseKey: 'page',
    gitPath: (_projectId: string, id: string) => pageKey(id),
    assertExists: async (req: import('express').Request) => {
        const { projectId, id } = req.params as Record<string, string>;
        await getPageWithAuth(req.user!, projectId, id);
    }
};

export const revisionsOpenapi = contentRevisionOpenApi(options);
export const revisionsRouter = createContentRevisionRouter(options);

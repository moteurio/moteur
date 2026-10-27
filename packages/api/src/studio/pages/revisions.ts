import { getPageWithAuth, restorePageAtRevision } from '@moteurio/core/pages.js';
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
    },
    restore: (req: import('express').Request, id: string, revisionId: string) =>
        restorePageAtRevision(String(req.params.projectId), req.user!, id, revisionId),
    restoreDescription:
        'Saves the content, template and settings of that revision as a new revision. Later revisions stay in the history. The place in the page tree, slug and status are unchanged; it goes live as saved when the person may publish, and otherwise waits for a review like any edit to a live page.'
};

export const revisionsOpenapi = contentRevisionOpenApi(options);
export const revisionsRouter = createContentRevisionRouter(options);

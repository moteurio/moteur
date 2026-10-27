import { getLayout, restoreLayoutAtRevision } from '@moteurio/core/layouts.js';
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
    },
    restoreAdminOnly: true,
    restore: (req: import('express').Request, id: string, revisionId: string) =>
        restoreLayoutAtRevision(req.user!, String(req.params.projectId), id, revisionId),
    restoreDescription:
        'Saves that revision of the layout as a new revision. Later revisions stay in the history. Layouts are live as saved.'
};

export const revisionsOpenapi = contentRevisionOpenApi(options);
export const revisionsRouter = createContentRevisionRouter(options);

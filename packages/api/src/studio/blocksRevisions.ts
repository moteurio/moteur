import { getBlock, listBlocks } from '@moteurio/core/blocks.js';
import { createSchemaRevisionRouter, schemaRevisionOpenApi } from '../schemaRevisions/mount.js';

function resolveBlockTypeKey(projectId: string, slugParam: string): string | undefined {
    const param = decodeURIComponent(slugParam).trim();
    if (!param) return undefined;
    const all = listBlocks(projectId);
    // Without a slash: the project's own block (`hero`); with one, the server's (`core/hero`).
    return all[param] ? param : undefined;
}

const options = {
    kind: 'block' as const,
    idParam: 'slug',
    openApiPath: '/projects/{projectId}/blocks/{slug}',
    tag: 'Blocks',
    responseKey: 'block',
    assertExists: async (req: import('express').Request) => {
        const projectId = (req.params as Record<string, string>).projectId;
        const slug = (req.params as Record<string, string>).slug;
        const key = resolveBlockTypeKey(projectId, slug);
        if (!key) {
            throw new Error('Block type not found');
        }
        getBlock(key, projectId);
    }
};

export const blocksRevisionsOpenapi = schemaRevisionOpenApi(options);
export const blocksRevisionsRouter = createSchemaRevisionRouter(options);

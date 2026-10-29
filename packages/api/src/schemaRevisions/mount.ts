import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    getSchemaAtRevision,
    getSchemaRevisions,
    projectSchemaGitPath,
    restoreSchemaAtRevision,
    type ProjectSchemaKind
} from '@moteurio/core/schemaRevisions.js';
import { requireProjectAccess, requireBuilder } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

export type SchemaRevisionMountOptions = {
    kind: ProjectSchemaKind;
    /** Express param that holds the schema id (modelId, id, formId, slug, …). */
    idParam: string;
    /** OpenAPI path prefix including projectId, e.g. `/projects/{projectId}/models/{modelId}`. */
    openApiPath: string;
    tag: string;
    /** JSON property wrapping the schema body on GET revision, e.g. `model`. */
    responseKey: string;
    /** Ensure the schema exists before listing history (404 when missing). */
    assertExists: (req: Request) => Promise<void>;
};

function parseMax(raw: unknown): number {
    const rawMax = raw;
    const maxStr =
        typeof rawMax === 'string'
            ? rawMax
            : Array.isArray(rawMax) && typeof rawMax[0] === 'string'
              ? rawMax[0]
              : '20';
    return Math.min(parseInt(maxStr, 10) || 20, 100);
}

export function createSchemaRevisionRouter(options: SchemaRevisionMountOptions): Router {
    const router = Router({ mergeParams: true });
    const { idParam, kind } = options;

    router.get(
        `/:${idParam}/revisions`,
        requireProjectAccess,
        async (req: Request, res: Response) => {
            const projectId = (req.params as Record<string, string>).projectId;
            const schemaId = (req.params as Record<string, string>)[idParam];
            if (!projectId || !schemaId) {
                return void res.status(400).json({ error: 'Missing path parameters' });
            }
            try {
                await options.assertExists(req);
                const gitPath = await projectSchemaGitPath(projectId, kind, schemaId);
                if (!gitPath) {
                    return void res.json([]);
                }
                const revisions = await getSchemaRevisions(
                    projectId,
                    kind,
                    schemaId,
                    gitPath,
                    parseMax(req.query.max)
                );
                return void res.json(revisions);
            } catch (err: unknown) {
                return void sendApiError(res, req, err);
            }
        }
    );

    router.get(
        `/:${idParam}/revisions/:revisionId`,
        requireProjectAccess,
        async (req: Request, res: Response) => {
            const params = req.params as Record<string, string>;
            const { projectId, revisionId } = params;
            const schemaId = params[idParam];
            if (!projectId || !schemaId || !revisionId) {
                return void res.status(400).json({ error: 'Missing path parameters' });
            }
            try {
                await options.assertExists(req);
                const gitPath = await projectSchemaGitPath(projectId, kind, schemaId);
                if (!gitPath) {
                    return void res.status(404).json({ error: 'Revision not found' });
                }
                const schema = await getSchemaAtRevision(projectId, gitPath, revisionId);
                if (!schema) {
                    return void res.status(404).json({ error: 'Revision not found' });
                }
                return void res.json({ [options.responseKey]: schema });
            } catch (err: unknown) {
                return void sendApiError(res, req, err);
            }
        }
    );

    router.post(
        `/:${idParam}/revisions/:revisionId/restore`,
        requireBuilder,
        async (req: Request, res: Response) => {
            const params = req.params as Record<string, string>;
            const { projectId, revisionId } = params;
            const schemaId = params[idParam];
            if (!projectId || !schemaId || !revisionId) {
                return void res.status(400).json({ error: 'Missing path parameters' });
            }
            try {
                await options.assertExists(req);
                const gitPath = await projectSchemaGitPath(projectId, kind, schemaId);
                if (!gitPath) {
                    return void res.status(404).json({ error: 'Revision not found' });
                }
                const schema = await restoreSchemaAtRevision(
                    req.user!,
                    projectId,
                    kind,
                    schemaId,
                    gitPath,
                    revisionId
                );
                return void res.json({ [options.responseKey]: schema });
            } catch (err: unknown) {
                return void sendApiError(res, req, err);
            }
        }
    );

    return router;
}

export function schemaRevisionOpenApi(
    options: SchemaRevisionMountOptions
): Record<string, OpenAPIV3.PathItemObject> {
    const base = options.openApiPath;
    const idName = options.idParam;
    const revItem = { $ref: '#/components/schemas/EntryRevision' };
    const schemaBody: OpenAPIV3.ResponseObject = {
        description: 'Schema at revision',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        [options.responseKey]: { type: 'object', additionalProperties: true }
                    }
                } as OpenAPIV3.SchemaObject
            }
        }
    };

    return {
        [`${base}/revisions`]: {
            get: {
                summary: 'Schema revision history (from git)',
                tags: [options.tag],
                parameters: [
                    { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: idName, in: 'path', required: true, schema: { type: 'string' } },
                    {
                        name: 'max',
                        in: 'query',
                        required: false,
                        schema: { type: 'integer', default: 20, maximum: 100 }
                    }
                ],
                responses: {
                    '200': {
                        description: 'Revision history (newest first)',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: revItem }
                            }
                        }
                    }
                }
            }
        },
        [`${base}/revisions/{revisionId}`]: {
            get: {
                summary: 'Schema as saved in one revision',
                tags: [options.tag],
                parameters: [
                    { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: idName, in: 'path', required: true, schema: { type: 'string' } },
                    {
                        name: 'revisionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' }
                    }
                ],
                responses: {
                    '200': schemaBody,
                    '404': { description: 'Schema or revision not found' }
                }
            }
        },
        [`${base}/revisions/{revisionId}/restore`]: {
            post: {
                summary: 'Restore the live schema from a revision',
                tags: [options.tag],
                parameters: [
                    { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: idName, in: 'path', required: true, schema: { type: 'string' } },
                    {
                        name: 'revisionId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' }
                    }
                ],
                responses: {
                    '200': { ...schemaBody, description: 'Restored schema' },
                    '404': { description: 'Schema or revision not found' }
                }
            }
        }
    };
}

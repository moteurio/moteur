import type { Request, Response } from 'express';
import { Router } from 'express';
import {
    addComment,
    getComments,
    resolveComment,
    deleteComment,
    editComment
} from '@moteurio/core/comments.js';
import type { CommentResourceType } from '@moteurio/types/Comment.js';
import { OPERATOR_ROLE_SLUG } from '@moteurio/types';
import type { OpenAPIV3 } from 'openapi-types';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const RESOURCE_TYPES: CommentResourceType[] = ['entry', 'layout'];

const router: Router = Router({ mergeParams: true });

type ProjectParams = { projectId: string };
type CommentIdParams = { projectId: string; id: string };
type CommentsListQuery = {
    resourceType?: string;
    resourceId?: string;
    fieldPath?: string;
    includeResolved?: string;
};
type CreateCommentBody = {
    resourceType?: string;
    resourceId?: string;
    fieldPath?: string;
    blockId?: string;
    parentId?: string;
    body?: string;
};
type EditCommentBody = { body?: string };

function isCommentResourceType(s: string): s is CommentResourceType {
    return (RESOURCE_TYPES as readonly string[]).includes(s);
}

router.post(
    '/',
    requireProjectAccess,
    async (req: Request<ProjectParams, unknown, CreateCommentBody>, res: Response) => {
        try {
            const { projectId } = req.params;
            if (!projectId) {
                return void res.status(400).json({ error: 'Missing projectId in path' });
            }
            const body = req.body ?? {};
            const {
                resourceType,
                resourceId,
                fieldPath,
                blockId,
                parentId,
                body: commentBody
            } = body;
            if (
                !resourceType ||
                !resourceId ||
                commentBody == null ||
                String(commentBody).trim() === ''
            ) {
                return void res.status(400).json({
                    error: 'resourceType, resourceId, and body are required'
                });
            }
            if (!isCommentResourceType(resourceType)) {
                return void res.status(400).json({
                    error: `resourceType must be one of: ${RESOURCE_TYPES.join(', ')}`
                });
            }
            const comment = await addComment(projectId, req.user!, {
                resourceType,
                resourceId,
                ...(fieldPath != null && { fieldPath: String(fieldPath) }),
                ...(blockId != null && { blockId: String(blockId) }),
                ...(parentId != null && { parentId: String(parentId) }),
                body: String(commentBody).trim()
            });
            return void res.status(201).json({ comment });
        } catch (err: unknown) {
            const status = getMessage(err)?.includes('not found') ? 404 : 400;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to add comment' });
        }
    }
);

router.get(
    '/',
    requireProjectAccess,
    async (req: Request<ProjectParams, unknown, unknown, CommentsListQuery>, res: Response) => {
        try {
            const { projectId } = req.params;
            if (!projectId) {
                return void res.status(400).json({ error: 'Missing projectId in path' });
            }
            const resourceType = req.query.resourceType;
            const resourceId = req.query.resourceId;
            if (!resourceType || !resourceId) {
                return void res.status(400).json({
                    error: 'resourceType and resourceId query parameters are required'
                });
            }
            if (!isCommentResourceType(resourceType)) {
                return void res.status(400).json({
                    error: `resourceType must be one of: ${RESOURCE_TYPES.join(', ')}`
                });
            }
            const ir = req.query.includeResolved;
            const includeResolved = ir === 'true' || ir === '1';
            const fieldPath =
                typeof req.query.fieldPath === 'string' ? req.query.fieldPath : undefined;
            const comments = await getComments(projectId, resourceType, resourceId, {
                includeResolved,
                ...(fieldPath !== undefined && { fieldPath })
            });
            return void res.json({ comments });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.patch(
    '/:id',
    requireProjectAccess,
    async (req: Request<CommentIdParams, unknown, EditCommentBody>, res: Response) => {
        try {
            const { projectId, id } = req.params;
            const body = req.body?.body;
            if (body == null || String(body).trim() === '') {
                return void res.status(400).json({ error: 'body is required' });
            }
            const comment = await editComment(projectId, req.user!, id, String(body).trim());
            return void res.json({ comment });
        } catch (err: unknown) {
            const status = getMessage(err)?.includes('not found')
                ? 404
                : getMessage(err)?.includes('author')
                  ? 403
                  : 400;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to edit comment' });
        }
    }
);

router.post(
    '/:id/resolve',
    requireProjectAccess,
    async (req: Request<CommentIdParams>, res: Response) => {
        try {
            const { projectId, id } = req.params;
            const comment = await resolveComment(projectId, req.user!, id);
            return void res.json({ comment });
        } catch (err: unknown) {
            const status = getMessage(err)?.includes('not found') ? 404 : 400;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to resolve comment' });
        }
    }
);

router.delete(
    '/:id',
    requireProjectAccess,
    async (req: Request<CommentIdParams>, res: Response) => {
        try {
            const { projectId, id } = req.params;
            await deleteComment(projectId, req.user!, id);
            return void res.status(204).send();
        } catch (err: unknown) {
            const status = getMessage(err)?.includes('not found')
                ? 404
                : getMessage(err)?.includes('author') ||
                    getMessage(err)?.includes(OPERATOR_ROLE_SLUG)
                  ? 403
                  : 400;
            return void res
                .status(status)
                .json({ error: getMessage(err) ?? 'Failed to delete comment' });
        }
    }
);

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    Comment: {
        type: 'object',
        properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            resourceType: { type: 'string', enum: RESOURCE_TYPES },
            resourceId: { type: 'string' },
            fieldPath: { type: 'string' },
            blockId: { type: 'string' },
            parentId: { type: 'string' },
            body: { type: 'string' },
            authorId: { type: 'string' },
            authorName: { type: 'string' },
            resolved: { type: 'boolean' },
            resolvedBy: { type: 'string' },
            resolvedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/comments': {
        post: {
            summary: 'Create a comment',
            tags: ['Comments'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['resourceType', 'resourceId', 'body'],
                            properties: {
                                resourceType: { type: 'string', enum: RESOURCE_TYPES },
                                resourceId: { type: 'string' },
                                fieldPath: { type: 'string' },
                                blockId: { type: 'string' },
                                parentId: { type: 'string' },
                                body: { type: 'string' }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Created comment',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { comment: { $ref: '#/components/schemas/Comment' } }
                            }
                        }
                    }
                },
                '400': { description: 'Bad request' },
                '404': { description: 'Not found' }
            }
        },
        get: {
            summary: 'List comments for a resource',
            tags: ['Comments'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'resourceType',
                    in: 'query',
                    required: true,
                    schema: { type: 'string', enum: RESOURCE_TYPES }
                },
                { name: 'resourceId', in: 'query', required: true, schema: { type: 'string' } },
                { name: 'fieldPath', in: 'query', schema: { type: 'string' } },
                {
                    name: 'includeResolved',
                    in: 'query',
                    schema: { type: 'boolean', default: false }
                }
            ],
            responses: {
                '200': {
                    description: 'List of comments',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    comments: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Comment' }
                                    }
                                }
                            }
                        }
                    }
                },
                '400': { description: 'Bad request' }
            }
        }
    },
    '/projects/{projectId}/comments/{id}': {
        patch: {
            summary: 'Edit a comment',
            tags: ['Comments'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['body'],
                            properties: { body: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated comment',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { comment: { $ref: '#/components/schemas/Comment' } }
                            }
                        }
                    }
                },
                '400': { description: 'Bad request' },
                '403': { description: 'Forbidden' },
                '404': { description: 'Not found' }
            }
        },
        delete: {
            summary: 'Delete a comment',
            tags: ['Comments'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'No content' },
                '403': { description: 'Forbidden' },
                '404': { description: 'Not found' }
            }
        }
    },
    '/projects/{projectId}/comments/{id}/resolve': {
        post: {
            summary: 'Resolve a comment',
            tags: ['Comments'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Resolved comment',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { comment: { $ref: '#/components/schemas/Comment' } }
                            }
                        }
                    }
                },
                '404': { description: 'Not found' }
            }
        }
    }
};

export default router;

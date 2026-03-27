import { randomUUID } from 'crypto';
import type {
    Comment,
    CommentInput,
    CommentResourceType,
    GetCommentsOptions
} from '@moteurio/types/Comment.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from './projects.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { COMMENTS_KEY } from './utils/storageKeys.js';
import { log, toActivityEvent } from './activityLogger.js';
import { triggerEvent } from './utils/eventBus.js';
import { commentsConfig } from './config/commentsConfig.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';

function normalizeUserName(user: User): string {
    return user?.name ?? user?.id ?? 'Unknown';
}

function validateCommentBody(body: string): void {
    const trimmed = body.trim();
    const max = commentsConfig.maxBodyLength;
    if (trimmed.length > max) {
        throw new Error(`Comment body must be at most ${max} characters (got ${trimmed.length}).`);
    }
}

/**
 * Adds a new comment. Validates project access and optional parent (replies one level deep).
 */
export async function addComment(
    projectId: string,
    user: User,
    input: CommentInput
): Promise<Comment> {
    await getProject(user, projectId);
    try {
        const list = (await getProjectJson<Comment[]>(projectId, COMMENTS_KEY)) ?? [];
        if (input.parentId) {
            const parent = list.find(c => c.id === input.parentId);
            if (!parent) throw new Error('Parent comment not found');
            if (parent.parentId) throw new Error('Replies are one level deep only');
        }
        const body = input.body.trim();
        validateCommentBody(body);
        const now = new Date().toISOString();
        const comment: Comment = {
            id: randomUUID(),
            projectId,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            ...(input.fieldPath !== undefined && { fieldPath: input.fieldPath }),
            ...(input.blockId !== undefined && { blockId: input.blockId }),
            ...(input.parentId !== undefined && { parentId: input.parentId }),
            body,
            authorId: user.id,
            authorName: normalizeUserName(user),
            resolved: false,
            createdAt: now,
            updatedAt: now
        };
        list.push(comment);
        await putProjectJson(projectId, COMMENTS_KEY, list);
        log(
            toActivityEvent(
                projectId,
                input.resourceType,
                input.resourceId,
                'commented',
                user,
                undefined,
                undefined,
                input.fieldPath
            )
        );
        try {
            await triggerEvent('comment.added', { projectId, comment });
        } catch {
            // never break on emit failure
        }
        try {
            if (input.resourceType === 'entry' && input.resourceId.includes('__')) {
                const [modelId, entryId] = input.resourceId.split('__');
                webhookDispatch(
                    'comment.created',
                    {
                        commentId: comment.id,
                        entryId,
                        modelId,
                        authorId: user.id
                    },
                    { projectId, source: 'api' }
                );
            }
        } catch {
            // never fail the operation
        }
        return comment;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to add comment');
    }
}

/**
 * Returns comments for a resource. Options: includeResolved (default false), fieldPath filter.
 */
export async function getComments(
    projectId: string,
    resourceType: CommentResourceType,
    resourceId: string,
    options?: GetCommentsOptions
): Promise<Comment[]> {
    try {
        const list = (await getProjectJson<Comment[]>(projectId, COMMENTS_KEY)) ?? [];
        let out = list.filter(
            c =>
                c.projectId === projectId &&
                c.resourceType === resourceType &&
                c.resourceId === resourceId
        );
        if (options?.fieldPath !== undefined) {
            out = out.filter(c => c.fieldPath === options.fieldPath);
        }
        if (!options?.includeResolved) {
            out = out.filter(c => !c.resolved);
        }
        out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return out;
    } catch {
        return [];
    }
}

/**
 * Marks a comment as resolved. Any project member can resolve.
 */
export async function resolveComment(
    projectId: string,
    user: User,
    commentId: string
): Promise<Comment> {
    await getProject(user, projectId);
    try {
        const list = (await getProjectJson<Comment[]>(projectId, COMMENTS_KEY)) ?? [];
        const idx = list.findIndex(c => c.id === commentId && c.projectId === projectId);
        if (idx === -1) throw new Error('Comment not found');
        const comment = list[idx]!;
        if (comment.resolved) return comment;
        const now = new Date().toISOString();
        const updated: Comment = {
            ...comment,
            resolved: true,
            resolvedBy: user.id,
            resolvedAt: now,
            updatedAt: now
        };
        list[idx] = updated;
        await putProjectJson(projectId, COMMENTS_KEY, list);
        log(
            toActivityEvent(
                projectId,
                comment.resourceType,
                comment.resourceId,
                'resolved',
                user,
                undefined,
                undefined,
                comment.fieldPath
            )
        );
        try {
            await triggerEvent('comment.resolved', { projectId, comment: updated });
        } catch {
            // never break on emit failure
        }
        return updated;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to resolve comment');
    }
}

/**
 * Hard deletes a comment. Only the author or an admin can delete.
 */
export async function deleteComment(
    projectId: string,
    user: User,
    commentId: string
): Promise<void> {
    await getProject(user, projectId);
    try {
        const list = (await getProjectJson<Comment[]>(projectId, COMMENTS_KEY)) ?? [];
        const idx = list.findIndex(c => c.id === commentId && c.projectId === projectId);
        if (idx === -1) throw new Error('Comment not found');
        const comment = list[idx]!;
        const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
        if (comment.authorId !== user.id && !isAdmin) {
            throw new Error('Only the author or an admin can delete this comment');
        }
        list.splice(idx, 1);
        await putProjectJson(projectId, COMMENTS_KEY, list);
        try {
            await triggerEvent('comment.deleted', { projectId, id: commentId });
        } catch {
            // never break on emit failure
        }
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to delete comment');
    }
}

/**
 * Edits comment body. Only the author can edit.
 */
export async function editComment(
    projectId: string,
    user: User,
    commentId: string,
    body: string
): Promise<Comment> {
    await getProject(user, projectId);
    try {
        const list = (await getProjectJson<Comment[]>(projectId, COMMENTS_KEY)) ?? [];
        const idx = list.findIndex(c => c.id === commentId && c.projectId === projectId);
        if (idx === -1) throw new Error('Comment not found');
        const comment = list[idx]!;
        if (comment.authorId !== user.id) {
            throw new Error('Only the author can edit this comment');
        }
        const trimmed = body.trim();
        validateCommentBody(trimmed);
        const now = new Date().toISOString();
        const updated: Comment = {
            ...comment,
            body: trimmed,
            updatedAt: now
        };
        list[idx] = updated;
        await putProjectJson(projectId, COMMENTS_KEY, list);
        try {
            await triggerEvent('comment.edited', { projectId, comment: updated });
        } catch {
            // never break on emit failure
        }
        return updated;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to edit comment');
    }
}

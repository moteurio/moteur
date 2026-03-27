import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    addComment,
    getComments,
    resolveComment,
    deleteComment,
    editComment
} from '../src/comments.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'comments-test-proj';
const author: User = {
    id: 'u1',
    name: 'Author',
    isActive: true,
    email: 'a@test.com',
    roles: [],
    projects: []
};
const otherUser: User = {
    id: 'u2',
    name: 'Other',
    isActive: true,
    email: 'b@test.com',
    roles: [],
    projects: []
};
const adminUser: User = {
    id: 'admin1',
    name: 'Admin',
    isActive: true,
    email: 'admin@test.com',
    roles: ['admin'],
    projects: []
};

describe('comments', () => {
    let tempDir: string;
    let projectDir: string;
    let originalDataRoot: string | undefined;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-comments-'));
        projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Test',
                defaultLocale: 'en',
                users: ['u1', 'u2', 'admin1']
            }),
            'utf-8'
        );
        originalDataRoot = process.env.DATA_ROOT;
        process.env.DATA_ROOT = tempDir;
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('addComment', () => {
        it('creates a comment and returns it', async () => {
            const comment = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Hello world'
            });
            expect(comment.id).toBeDefined();
            expect(comment.projectId).toBe(projectId);
            expect(comment.resourceType).toBe('entry');
            expect(comment.resourceId).toBe('article__e1');
            expect(comment.body).toBe('Hello world');
            expect(comment.authorId).toBe('u1');
            expect(comment.authorName).toBe('Author');
            expect(comment.resolved).toBe(false);
            expect(comment.createdAt).toBeDefined();
            expect(comment.updatedAt).toBeDefined();
        });

        it('creates a reply when parentId is valid', async () => {
            const parent = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Parent'
            });
            const reply = await addComment(projectId, otherUser, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                parentId: parent.id,
                body: 'Reply'
            });
            expect(reply.parentId).toBe(parent.id);
            expect(reply.body).toBe('Reply');
        });

        it('throws when parentId does not exist', async () => {
            await expect(
                addComment(projectId, author, {
                    resourceType: 'entry',
                    resourceId: 'article__e1',
                    parentId: 'nonexistent',
                    body: 'Reply'
                })
            ).rejects.toThrow('Parent comment not found');
        });

        it('throws when replying to a reply (one level only)', async () => {
            const parent = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Parent'
            });
            const reply = await addComment(projectId, otherUser, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                parentId: parent.id,
                body: 'Reply'
            });
            await expect(
                addComment(projectId, author, {
                    resourceType: 'entry',
                    resourceId: 'article__e1',
                    parentId: reply.id,
                    body: 'Nested reply'
                })
            ).rejects.toThrow('Replies are one level deep only');
        });

        it('throws when user has no project access', async () => {
            const noAccess: User = { ...author, id: 'noaccess' };
            await expect(
                addComment(projectId, noAccess, {
                    resourceType: 'entry',
                    resourceId: 'article__e1',
                    body: 'Hi'
                })
            ).rejects.toThrow();
        });

        it('throws when body exceeds configured max length', async () => {
            const prev = process.env.COMMENTS_MAX_BODY_LENGTH;
            process.env.COMMENTS_MAX_BODY_LENGTH = '5';
            try {
                await expect(
                    addComment(projectId, author, {
                        resourceType: 'entry',
                        resourceId: 'article__e1',
                        body: '123456'
                    })
                ).rejects.toThrow(/at most 5 characters/);
            } finally {
                if (prev !== undefined) process.env.COMMENTS_MAX_BODY_LENGTH = prev;
                else delete process.env.COMMENTS_MAX_BODY_LENGTH;
            }
        });
    });

    describe('getComments', () => {
        it('returns empty array when no comments exist', async () => {
            const list = await getComments(projectId, 'entry', 'article__e1');
            expect(list).toEqual([]);
        });

        it('returns comments for the resource, excluding resolved by default', async () => {
            await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'First'
            });
            await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Second'
            });
            const list = await getComments(projectId, 'entry', 'article__e1');
            expect(list).toHaveLength(2);
            expect(list[0].body).toBe('First');
            expect(list[1].body).toBe('Second');
        });

        it('filters by fieldPath when provided', async () => {
            await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                fieldPath: 'hero.title',
                body: 'On field'
            });
            await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Top level'
            });
            const withField = await getComments(projectId, 'entry', 'article__e1', {
                fieldPath: 'hero.title'
            });
            expect(withField).toHaveLength(1);
            expect(withField[0].fieldPath).toBe('hero.title');
        });

        it('includes resolved when includeResolved is true', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Comment'
            });
            await resolveComment(projectId, author, c.id);
            const without = await getComments(projectId, 'entry', 'article__e1');
            expect(without).toHaveLength(0);
            const withResolved = await getComments(projectId, 'entry', 'article__e1', {
                includeResolved: true
            });
            expect(withResolved).toHaveLength(1);
            expect(withResolved[0].resolved).toBe(true);
        });

        it('does not return comments for other resources', async () => {
            await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'On e1'
            });
            const list = await getComments(projectId, 'entry', 'article__e2');
            expect(list).toHaveLength(0);
        });
    });

    describe('resolveComment', () => {
        it('marks comment resolved and sets resolvedBy and resolvedAt', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Comment'
            });
            const resolved = await resolveComment(projectId, otherUser, c.id);
            expect(resolved.resolved).toBe(true);
            expect(resolved.resolvedBy).toBe('u2');
            expect(resolved.resolvedAt).toBeDefined();
        });

        it('returns same comment when already resolved', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Comment'
            });
            await resolveComment(projectId, author, c.id);
            const again = await resolveComment(projectId, otherUser, c.id);
            expect(again.resolved).toBe(true);
        });

        it('throws when comment not found', async () => {
            await expect(resolveComment(projectId, author, 'nonexistent')).rejects.toThrow(
                'Comment not found'
            );
        });
    });

    describe('deleteComment', () => {
        it('allows author to delete own comment', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Mine'
            });
            await deleteComment(projectId, author, c.id);
            const list = await getComments(projectId, 'entry', 'article__e1', {
                includeResolved: true
            });
            expect(list).toHaveLength(0);
        });

        it('allows admin to delete any comment', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'By author'
            });
            await deleteComment(projectId, adminUser, c.id);
            const list = await getComments(projectId, 'entry', 'article__e1', {
                includeResolved: true
            });
            expect(list).toHaveLength(0);
        });

        it('throws when non-author non-admin tries to delete', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Mine'
            });
            await expect(deleteComment(projectId, otherUser, c.id)).rejects.toThrow(
                /author or an admin/
            );
        });

        it('throws when comment not found', async () => {
            await expect(deleteComment(projectId, author, 'nonexistent')).rejects.toThrow(
                'Comment not found'
            );
        });
    });

    describe('editComment', () => {
        it('allows author to edit body', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Original'
            });
            const updated = await editComment(projectId, author, c.id, 'Updated text');
            expect(updated.body).toBe('Updated text');
            expect(updated.updatedAt).not.toBe(c.updatedAt);
        });

        it('throws when non-author tries to edit', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Mine'
            });
            await expect(editComment(projectId, otherUser, c.id, 'Hacked')).rejects.toThrow(
                'Only the author can edit this comment'
            );
        });

        it('throws when comment not found', async () => {
            await expect(editComment(projectId, author, 'nonexistent', 'Text')).rejects.toThrow(
                'Comment not found'
            );
        });

        it('throws when body exceeds configured max length', async () => {
            const c = await addComment(projectId, author, {
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Hi'
            });
            const prev = process.env.COMMENTS_MAX_BODY_LENGTH;
            process.env.COMMENTS_MAX_BODY_LENGTH = '3';
            try {
                await expect(editComment(projectId, author, c.id, 'four')).rejects.toThrow(
                    /at most 3 characters/
                );
            } finally {
                if (prev !== undefined) process.env.COMMENTS_MAX_BODY_LENGTH = prev;
                else delete process.env.COMMENTS_MAX_BODY_LENGTH;
            }
        });
    });
});

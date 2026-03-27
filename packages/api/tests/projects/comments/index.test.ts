import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

vi.mock('../../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', name: 'User One', roles: [] };
        next();
    }
}));

vi.mock('@moteurio/core/comments.js', () => ({
    addComment: vi.fn(),
    getComments: vi.fn(),
    resolveComment: vi.fn(),
    deleteComment: vi.fn(),
    editComment: vi.fn()
}));

import commentsRouter from '../../../src/projects/comments/index';
import {
    addComment,
    getComments,
    resolveComment,
    deleteComment,
    editComment
} from '@moteurio/core/comments.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/comments', commentsRouter);

const mockComment = {
    id: 'comment-1',
    projectId: 'proj1',
    resourceType: 'entry',
    resourceId: 'article__e1',
    body: 'Test comment',
    authorId: 'user1',
    authorName: 'User One',
    resolved: false,
    createdAt: '2025-01-01T12:00:00.000Z',
    updatedAt: '2025-01-01T12:00:00.000Z'
};

describe('POST /projects/:projectId/comments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a comment and returns 201', async () => {
        (addComment as any).mockResolvedValue(mockComment);

        const res = await request(app).post('/projects/proj1/comments').send({
            resourceType: 'entry',
            resourceId: 'article__e1',
            body: 'Test comment'
        });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ comment: mockComment });
        expect(addComment).toHaveBeenCalledWith(
            'proj1',
            expect.any(Object),
            expect.objectContaining({
                resourceType: 'entry',
                resourceId: 'article__e1',
                body: 'Test comment'
            })
        );
    });

    it('returns 400 when resourceType, resourceId or body missing', async () => {
        const res = await request(app).post('/projects/proj1/comments').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/);
        expect(addComment).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid resourceType', async () => {
        const res = await request(app).post('/projects/proj1/comments').send({
            resourceType: 'invalid',
            resourceId: 'article__e1',
            body: 'Hi'
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/entry|layout/);
    });

    it('returns 404 when addComment throws not found', async () => {
        (addComment as any).mockRejectedValue(new Error('Parent comment not found'));

        const res = await request(app).post('/projects/proj1/comments').send({
            resourceType: 'entry',
            resourceId: 'article__e1',
            parentId: 'bad',
            body: 'Reply'
        });

        expect(res.status).toBe(404);
    });
});

describe('GET /projects/:projectId/comments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns comments for resource', async () => {
        (getComments as any).mockResolvedValue([mockComment]);

        const res = await request(app).get(
            '/projects/proj1/comments?resourceType=entry&resourceId=article__e1'
        );

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ comments: [mockComment] });
        expect(getComments).toHaveBeenCalledWith(
            'proj1',
            'entry',
            'article__e1',
            expect.any(Object)
        );
    });

    it('returns 400 when resourceType or resourceId missing', async () => {
        const res = await request(app).get('/projects/proj1/comments');

        expect(res.status).toBe(400);
        expect(getComments).not.toHaveBeenCalled();
    });

    it('passes includeResolved and fieldPath', async () => {
        (getComments as any).mockResolvedValue([]);

        await request(app).get(
            '/projects/proj1/comments?resourceType=layout&resourceId=home&includeResolved=true&fieldPath=hero.title'
        );

        expect(getComments).toHaveBeenCalledWith('proj1', 'layout', 'home', {
            includeResolved: true,
            fieldPath: 'hero.title'
        });
    });
});

describe('PATCH /projects/:projectId/comments/:id', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('edits comment and returns 200', async () => {
        const updated = { ...mockComment, body: 'Updated', updatedAt: '2025-01-01T13:00:00.000Z' };
        (editComment as any).mockResolvedValue(updated);

        const res = await request(app)
            .patch('/projects/proj1/comments/comment-1')
            .send({ body: 'Updated' });

        expect(res.status).toBe(200);
        expect(res.body.comment.body).toBe('Updated');
        expect(editComment).toHaveBeenCalledWith(
            'proj1',
            expect.any(Object),
            'comment-1',
            'Updated'
        );
    });

    it('returns 400 when body missing', async () => {
        const res = await request(app).patch('/projects/proj1/comments/comment-1').send({});

        expect(res.status).toBe(400);
        expect(editComment).not.toHaveBeenCalled();
    });

    it('returns 403 when only author can edit', async () => {
        (editComment as any).mockRejectedValue(new Error('Only the author can edit this comment'));

        const res = await request(app)
            .patch('/projects/proj1/comments/comment-1')
            .send({ body: 'Hacked' });

        expect(res.status).toBe(403);
    });
});

describe('POST /projects/:projectId/comments/:id/resolve', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves comment and returns 200', async () => {
        const resolved = {
            ...mockComment,
            resolved: true,
            resolvedBy: 'user1',
            resolvedAt: '2025-01-01T13:00:00.000Z'
        };
        (resolveComment as any).mockResolvedValue(resolved);

        const res = await request(app).post('/projects/proj1/comments/comment-1/resolve');

        expect(res.status).toBe(200);
        expect(res.body.comment.resolved).toBe(true);
        expect(resolveComment).toHaveBeenCalledWith('proj1', expect.any(Object), 'comment-1');
    });

    it('returns 404 when comment not found', async () => {
        (resolveComment as any).mockRejectedValue(new Error('Comment not found'));

        const res = await request(app).post('/projects/proj1/comments/nonexistent/resolve');

        expect(res.status).toBe(404);
    });
});

describe('DELETE /projects/:projectId/comments/:id', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deletes comment and returns 204', async () => {
        (deleteComment as any).mockResolvedValue(undefined);

        const res = await request(app).delete('/projects/proj1/comments/comment-1');

        expect(res.status).toBe(204);
        expect(res.body).toEqual({});
        expect(deleteComment).toHaveBeenCalledWith('proj1', expect.any(Object), 'comment-1');
    });

    it('returns 403 when only author or operator can delete', async () => {
        (deleteComment as any).mockRejectedValue(
            new Error(`Only the author or an ${OPERATOR_ROLE_SLUG} can delete this comment`)
        );

        const res = await request(app).delete('/projects/proj1/comments/comment-1');

        expect(res.status).toBe(403);
    });

    it('returns 404 when comment not found', async () => {
        (deleteComment as any).mockRejectedValue(new Error('Comment not found'));

        const res = await request(app).delete('/projects/proj1/comments/nonexistent');

        expect(res.status).toBe(404);
    });
});

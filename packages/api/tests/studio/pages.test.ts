import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    },
    optionalProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/pages.js', () => ({
    listPages: vi.fn(),
    getPage: vi.fn(),
    getPageWithAuth: vi.fn(),
    getPageBySlug: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
    reorderPages: vi.fn(),
    validatePageById: vi.fn(),
    validateAllPages: vi.fn()
}));

vi.mock('@moteurio/core/reviews.js', () => ({
    submitForPageReview: vi.fn()
}));

import pagesStudioRouter from '../../src/studio/pages/index.js';
import {
    listPages,
    getPageWithAuth,
    getPageBySlug,
    createPage,
    updatePage,
    deletePage,
    reorderPages,
    validatePageById,
    validateAllPages
} from '@moteurio/core/pages.js';
import { submitForPageReview } from '@moteurio/core/reviews.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/pages', pagesStudioRouter);

const base = '/projects/demo/pages';

const mockPage = {
    id: 'page1',
    projectId: 'demo',
    type: 'static' as const,
    templateId: 't1',
    label: 'Home',
    slug: 'home',
    parentId: null,
    order: 0,
    navInclude: true,
    sitemapInclude: true,
    sitemapPriority: 0.5,
    status: 'published' as const,
    fields: {},
    createdAt: '',
    updatedAt: ''
};

describe('Pages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET / should return list of pages', async () => {
        (listPages as any).mockResolvedValue([mockPage]);

        const res = await request(app).get(base);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([mockPage]);
        expect(listPages).toHaveBeenCalledWith('demo', {
            templateId: undefined,
            parentId: undefined,
            status: undefined,
            type: undefined
        });
    });

    it('GET /by-slug/:slug should return page', async () => {
        (getPageBySlug as any).mockResolvedValue(mockPage);

        const res = await request(app).get(`${base}/by-slug/home`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockPage);
        expect(getPageBySlug).toHaveBeenCalledWith('demo', 'home');
    });

    it('GET /:id should return page', async () => {
        (getPageWithAuth as any).mockResolvedValue(mockPage);

        const res = await request(app).get(`${base}/page1`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockPage);
        expect(getPageWithAuth).toHaveBeenCalledWith(expect.any(Object), 'demo', 'page1');
    });

    it('POST / should create page and return 201', async () => {
        const body = {
            type: 'static',
            templateId: 't1',
            label: 'New',
            projectId: 'demo',
            fields: {},
            status: 'draft'
        };
        (createPage as any).mockResolvedValue({ ...mockPage, ...body, id: 'new-id' });

        const res = await request(app).post(base).send(body);

        expect(res.status).toBe(201);
        expect(createPage).toHaveBeenCalledWith(
            'demo',
            expect.any(Object),
            expect.objectContaining({ templateId: 't1', label: 'New' })
        );
    });

    it('PATCH /:id should update page', async () => {
        (updatePage as any).mockResolvedValue({ ...mockPage, label: 'Updated' });

        const res = await request(app).patch(`${base}/page1`).send({ label: 'Updated' });

        expect(res.status).toBe(200);
        expect(res.body.label).toBe('Updated');
        expect(updatePage).toHaveBeenCalledWith('demo', expect.any(Object), 'page1', {
            label: 'Updated'
        });
    });

    it('DELETE /:id should return 204', async () => {
        (deletePage as any).mockResolvedValue(undefined);

        const res = await request(app).delete(`${base}/page1`);

        expect(res.status).toBe(204);
        expect(deletePage).toHaveBeenCalledWith('demo', expect.any(Object), 'page1');
    });

    it('PATCH /:id/status should update status', async () => {
        (updatePage as any).mockResolvedValue({ ...mockPage, status: 'published' });

        const res = await request(app).patch(`${base}/page1/status`).send({ status: 'published' });

        expect(res.status).toBe(200);
        expect(updatePage).toHaveBeenCalledWith('demo', expect.any(Object), 'page1', {
            status: 'published'
        });
    });

    it('POST /:id/submit-review should return 201', async () => {
        (submitForPageReview as any).mockResolvedValue({ id: 'review-1', status: 'pending' });

        const res = await request(app).post(`${base}/page1/submit-review`).send({});

        expect(res.status).toBe(201);
        expect(submitForPageReview).toHaveBeenCalledWith(
            'demo',
            expect.any(Object),
            'page1',
            undefined
        );
    });

    it('POST /:id/validate should return validation result', async () => {
        (validatePageById as any).mockResolvedValue({ valid: true, issues: [] });

        const res = await request(app).post(`${base}/page1/validate`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ valid: true, issues: [] });
        expect(validatePageById).toHaveBeenCalledWith('demo', 'page1');
    });

    it('POST /validate-all should return validation results', async () => {
        (validateAllPages as any).mockResolvedValue([{ valid: true, issues: [] }]);

        const res = await request(app).post(`${base}/validate-all`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ valid: true, issues: [] }]);
        expect(validateAllPages).toHaveBeenCalledWith('demo');
    });

    it('POST /reorder should return updated pages', async () => {
        const updated = [
            { ...mockPage, order: 1 },
            { ...mockPage, id: 'page2', order: 0 }
        ];
        (reorderPages as any).mockResolvedValue(updated);

        const res = await request(app)
            .post(`${base}/reorder`)
            .send([
                { id: 'page1', parentId: null, order: 1 },
                { id: 'page2', parentId: null, order: 0 }
            ]);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(reorderPages).toHaveBeenCalledWith('demo', expect.any(Object), [
            { id: 'page1', parentId: null, order: 1 },
            { id: 'page2', parentId: null, order: 0 }
        ]);
    });

    it('DELETE /:id should return 409 when page has children', async () => {
        const err = new Error(
            'Cannot delete a page that has children. Move or delete the children first.'
        );
        (err as any).statusCode = 409;
        (deletePage as any).mockRejectedValue(err);

        const res = await request(app).delete(`${base}/page1`);

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('children');
    });
});

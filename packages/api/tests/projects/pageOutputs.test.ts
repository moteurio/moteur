import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => {
    const pass = (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['admin'] };
        next();
    };
    return {
        optionalAuth: pass,
        apiKeyAuth: pass,
        requireChannelOrProjectAccess: pass,
        requireProjectAccess: pass,
        denyIfApiKeySiteWideBlocked: () => false
    };
});

vi.mock('@moteurio/core/pages.js', () => ({
    resolveAllUrls: vi.fn(),
    resolveBreadcrumb: vi.fn(),
    getNavigation: vi.fn(),
    resolvePath: vi.fn()
}));

vi.mock('@moteurio/core/projects.js', () => ({
    getProjectById: vi.fn()
}));

vi.mock('@moteurio/core/redirects.js', () => ({
    listRedirects: vi.fn(),
    createRedirect: vi.fn(),
    updateRedirect: vi.fn(),
    deleteRedirect: vi.fn()
}));

import pageOutputsRouter from '../../src/projects/pageOutputs.js';
import { resolveAllUrls, getNavigation, resolvePath } from '@moteurio/core/pages.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { createRedirect, deleteRedirect, listRedirects } from '@moteurio/core/redirects.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId', pageOutputsRouter);

const row = (url: string, locale: string, alternates: Record<string, string>) => ({
    url,
    locale,
    alternates,
    nodeId: 'about',
    nodeType: 'static',
    label: 'About',
    navInclude: true,
    sitemapInclude: true,
    sitemapPriority: 0.5
});

describe('page outputs in every language', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const alternates = { en: '/about', fr: '/fr/a-propos' };
        vi.mocked(resolveAllUrls).mockResolvedValue([
            row('/about', 'en', alternates),
            row('/fr/a-propos', 'fr', alternates)
        ] as never);
        vi.mocked(getProjectById).mockResolvedValue({
            id: 'demo',
            defaultLocale: 'en',
            siteUrl: 'https://example.com/'
        } as never);
    });

    it('lists each language in the sitemap with its alternates and x-default', async () => {
        const res = await request(app).get('/projects/demo/sitemap.xml');
        expect(res.status).toBe(200);
        expect(res.text).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
        expect(res.text).toContain(
            '<url><loc>https://example.com/fr/a-propos</loc>' +
                '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>' +
                '<xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/a-propos"/>' +
                '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>'
        );
    });

    it('filters addresses by ?locale=, and passes it to the navigation', async () => {
        const res = await request(app).get('/projects/demo/urls?locale=fr');
        expect(res.body.map((u: { url: string }) => u.url)).toEqual(['/fr/a-propos']);
        const json = await request(app).get('/projects/demo/sitemap.json?lang=en');
        expect(json.body.map((u: { url: string }) => u.url)).toEqual(['/about']);

        vi.mocked(getNavigation).mockResolvedValue([]);
        await request(app).get('/projects/demo/navigation?locale=fr&depth=2');
        expect(getNavigation).toHaveBeenCalledWith('demo', {
            depth: 2,
            rootId: undefined,
            locale: 'fr'
        });
    });

    it('says what lives at a path, or 404', async () => {
        vi.mocked(resolvePath).mockResolvedValueOnce({
            match: 'redirect',
            from: '/old',
            to: '/about',
            status: 301
        });
        const found = await request(app).get('/projects/demo/resolve?path=/old');
        expect(found.body).toEqual({ match: 'redirect', from: '/old', to: '/about', status: 301 });
        expect(resolvePath).toHaveBeenCalledWith('demo', '/old');

        vi.mocked(resolvePath).mockResolvedValueOnce(null);
        expect((await request(app).get('/projects/demo/resolve?path=/x')).status).toBe(404);
        expect((await request(app).get('/projects/demo/resolve')).status).toBe(400);
    });

    it('lists, creates and deletes redirects', async () => {
        vi.mocked(listRedirects).mockResolvedValue([]);
        expect((await request(app).get('/projects/demo/redirects')).body).toEqual([]);

        vi.mocked(createRedirect).mockResolvedValue({ id: 'r1' } as never);
        const created = await request(app)
            .post('/projects/demo/redirects')
            .send({ from: '/a', to: '/b' });
        expect(created.status).toBe(201);
        expect(createRedirect).toHaveBeenCalledWith(
            'demo',
            expect.objectContaining({ id: 'user1' }),
            { from: '/a', to: '/b' }
        );

        const refused = Object.assign(new Error('There is already a redirect from /a.'), {
            statusCode: 409
        });
        vi.mocked(createRedirect).mockRejectedValueOnce(refused);
        const conflict = await request(app)
            .post('/projects/demo/redirects')
            .send({ from: '/a', to: '/c' });
        expect(conflict.status).toBe(409);

        expect((await request(app).delete('/projects/demo/redirects/r1')).status).toBe(204);
        expect(deleteRedirect).toHaveBeenCalledWith('demo', expect.anything(), 'r1');
    });
});

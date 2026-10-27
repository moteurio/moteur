import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@moteurio/core/apiCollections.js', () => ({
    listCollections: vi.fn(),
    getCollection: vi.fn()
}));
vi.mock('@moteurio/core/projectApiKey.js', () => ({
    verifyProjectApiKey: vi.fn()
}));
vi.mock('@moteurio/core/previewTokens.js', () => ({
    verifyPreviewToken: vi.fn()
}));
vi.mock('@moteurio/core/entries.js', () => ({
    queryEntriesForProject: vi.fn(),
    getEntryForProject: vi.fn(),
    getPublishedEntryForProject: vi.fn()
}));
vi.mock('@moteurio/core/models.js', () => ({
    getModelSchemaForProject: vi.fn()
}));
vi.mock('@moteurio/core/utils/projectStorage.js', () => ({
    listProjectKeys: vi.fn(async () => [] as string[]),
    getProjectJson: vi.fn()
}));
vi.mock('@moteurio/core/navigations.js', () => ({
    listNavigations: vi.fn(),
    getNavigationByHandle: vi.fn(),
    resolveNavigation: vi.fn(async (_p: string, nav: any) => ({ ...nav, resolved: true }))
}));
vi.mock('@moteurio/core/publicSchema.js', () => ({
    channelSchema: vi.fn(),
    schemaTypes: vi.fn(() => 'export interface MoteurSchema {}\n')
}));
vi.mock('@moteurio/core/projects.js', () => ({
    getProjectById: vi.fn(async () => ({ defaultLocale: 'fr' }))
}));

import { listCollections, getCollection } from '@moteurio/core/apiCollections.js';
import { verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
import { verifyPreviewToken } from '@moteurio/core/previewTokens.js';
import { previewTokenAuth } from '../../../src/middlewares/previewToken.js';
import {
    queryEntriesForProject,
    getEntryForProject,
    getPublishedEntryForProject
} from '@moteurio/core/entries.js';
import { getModelSchemaForProject } from '@moteurio/core/models.js';
import { getProjectJson, listProjectKeys } from '@moteurio/core/utils/projectStorage.js';
import {
    listNavigations,
    getNavigationByHandle,
    resolveNavigation
} from '@moteurio/core/navigations.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { channelSchema } from '@moteurio/core/publicSchema.js';
import collectionsPublicRouter from '../../../src/projects/collections/public.js';
import {
    optionalAuth,
    apiKeyAuth,
    requireCollectionOrProjectAccess
} from '../../../src/middlewares/auth.js';

const app = express();
app.use(express.json());
app.use(
    '/projects/:projectId/collections',
    (req, _res, next) => {
        req.params = { ...req.params, projectId: req.params.projectId };
        next();
    },
    optionalAuth,
    apiKeyAuth,
    previewTokenAuth,
    requireCollectionOrProjectAccess,
    collectionsPublicRouter
);

describe('GET /projects/:projectId/collections (public API)', () => {
    const fullPolicy = {
        keyId: 'k1',
        policy: { collectionWhitelist: null as string[] | null, allowSiteWideReads: true }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyProjectApiKey).mockResolvedValue({ ok: false });
    });

    it('returns 401 when no API key and no JWT', async () => {
        const res = await request(app).get('/projects/demo/collections');
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/API key or JWT required/i);
    });

    it('returns 401 when API key is invalid', async () => {
        vi.mocked(verifyProjectApiKey).mockResolvedValue({ ok: false });
        const res = await request(app)
            .get('/projects/demo/collections')
            .set('x-api-key', 'invalid');
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Invalid API key/i);
    });

    it('returns 200 and list when API key is valid', async () => {
        vi.mocked(verifyProjectApiKey).mockResolvedValue({ ok: true, ...fullPolicy });
        vi.mocked(listCollections).mockResolvedValue([
            {
                id: 'c1',
                projectId: 'demo',
                label: 'Blog',
                resources: [],
                createdAt: '',
                updatedAt: ''
            }
        ]);
        const res = await request(app)
            .get('/projects/demo/collections')
            .set('x-api-key', 'valid-key');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].label).toBe('Blog');
        expect(verifyProjectApiKey).toHaveBeenCalledWith('demo', 'valid-key');
    });

    it('returns 403 when allowedHosts is set but Origin is missing', async () => {
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            ...fullPolicy,
            allowedHosts: ['example.com']
        });
        const res = await request(app)
            .get('/projects/demo/collections')
            .set('x-api-key', 'valid-key');
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('API_KEY_HOST_NOT_ALLOWED');
    });

    it('returns 200 when allowedHosts matches Origin', async () => {
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            ...fullPolicy,
            allowedHosts: ['*.my-project.vercel.com']
        });
        vi.mocked(listCollections).mockResolvedValue([
            {
                id: 'c1',
                projectId: 'demo',
                label: 'Blog',
                resources: [],
                createdAt: '',
                updatedAt: ''
            }
        ]);
        const res = await request(app)
            .get('/projects/demo/collections')
            .set('x-api-key', 'valid-key')
            .set('Origin', 'https://foo.my-project.vercel.com');
        expect(res.status).toBe(200);
    });

    it('returns 401 for non-GET with API key only (handler requires JWT)', async () => {
        vi.mocked(verifyProjectApiKey).mockResolvedValue({ ok: true, ...fullPolicy });
        const res = await request(app)
            .post('/projects/demo/collections')
            .set('x-api-key', 'valid-key')
            .send({ label: 'x' });
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/No token provided/i);
    });
});

describe('GET /projects/:projectId/collections/:collectionId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist: null, allowSiteWideReads: true }
        });
    });

    it('returns 404 when collection not found', async () => {
        vi.mocked(getCollection).mockResolvedValue(null);
        const res = await request(app)
            .get('/projects/demo/collections/nonexistent')
            .set('x-api-key', 'key');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 200 and collection when found', async () => {
        const col = {
            id: 'c1',
            projectId: 'demo',
            label: 'API',
            resources: [],
            createdAt: '',
            updatedAt: ''
        };
        vi.mocked(getCollection).mockResolvedValue(col);
        const res = await request(app).get('/projects/demo/collections/c1').set('x-api-key', 'key');
        expect(res.status).toBe(200);
        expect(res.body.label).toBe('API');
        expect(res.body.publicApi).toMatchObject({
            openApiJson: '/projects/demo/collections/c1/openapi'
        });
    });
});

describe('GET /projects/:projectId/collections/:collectionId/:resourceId/entries', () => {
    const collection = {
        id: 'c1',
        projectId: 'demo',
        label: 'API',
        resources: [{ resourceType: 'model' as const, resourceId: 'articles' }],
        createdAt: '',
        updatedAt: ''
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyPreviewToken).mockResolvedValue({ ok: false });
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist: null, allowSiteWideReads: true }
        });
        vi.mocked(getCollection).mockResolvedValue(collection);
        vi.mocked(queryEntriesForProject).mockResolvedValue({
            items: [
                { id: 'a', type: 'articles', status: 'published', data: {} },
                { id: 'b', type: 'articles', status: 'published', data: {} }
            ],
            total: 7
        });
    });

    it('lists published versions, unpaged by default, with the total in X-Total-Count', async () => {
        const res = await request(app)
            .get('/projects/demo/collections/c1/articles/entries')
            .set('x-api-key', 'key');
        expect(res.status).toBe(200);
        expect(res.body.map((e: { id: string }) => e.id)).toEqual(['a', 'b']);
        expect(res.headers['x-total-count']).toBe('7');
        expect(queryEntriesForProject).toHaveBeenCalledWith(
            'demo',
            'articles',
            expect.objectContaining({
                view: 'published',
                status: ['published']
            })
        );
    });

    it('passes limit, offset and sort to the content index', async () => {
        const res = await request(app)
            .get(
                '/projects/demo/collections/c1/articles/entries?limit=2&offset=4&sort=-publishedAt'
            )
            .set('x-api-key', 'key');
        expect(res.status).toBe(200);
        expect(queryEntriesForProject).toHaveBeenCalledWith('demo', 'articles', {
            view: 'published',
            status: ['published'],
            limit: 2,
            offset: 4,
            sort: { field: 'publishedAt', direction: 'desc' }
        });
    });

    it('ignores a status parameter: the collection decides which statuses are public', async () => {
        await request(app)
            .get('/projects/demo/collections/c1/articles/entries?status=draft')
            .set('x-api-key', 'key');
        expect(vi.mocked(queryEntriesForProject).mock.calls[0][2]).toMatchObject({
            status: ['published']
        });
    });

    it('uses latest view and draft statuses when a valid preview token is sent', async () => {
        vi.mocked(verifyPreviewToken).mockResolvedValue({ ok: true, tokenId: 'pt1' });
        await request(app)
            .get('/projects/demo/collections/c1/articles/entries')
            .set('x-api-key', 'key')
            .set('x-preview-token', 'mpv_testtoken');
        expect(verifyPreviewToken).toHaveBeenCalledWith('demo', 'mpv_testtoken');
        expect(queryEntriesForProject).toHaveBeenCalledWith(
            'demo',
            'articles',
            expect.objectContaining({
                view: 'latest',
                status: ['draft', 'in_review', 'published']
            })
        );
    });

    it('a preview link for one entry shows that entry as it is now, the rest as published', async () => {
        vi.mocked(verifyPreviewToken).mockResolvedValue({ ok: true, tokenId: 'pt1', entryId: 'n' });
        vi.mocked(getEntryForProject).mockResolvedValue({
            id: 'n',
            type: 'articles',
            status: 'draft',
            data: { title: 'New' }
        });
        vi.mocked(getPublishedEntryForProject).mockResolvedValue(null);
        vi.mocked(queryEntriesForProject).mockImplementation(async (_p, _m, q) =>
            q?.view === 'latest'
                ? {
                      items: [
                          { id: 'a', type: 'articles', status: 'draft', data: { title: 'Secret' } },
                          { id: 'n', type: 'articles', status: 'draft', data: { title: 'New' } }
                      ],
                      total: 2
                  }
                : {
                      items: [{ id: 'a', type: 'articles', status: 'published', data: {} }],
                      total: 1
                  }
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/articles/entries')
            .set('x-api-key', 'key')
            .set('x-preview-token', 'mpv_testtoken');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { id: 'a', type: 'articles', status: 'published', data: {} },
            { id: 'n', type: 'articles', status: 'draft', data: { title: 'New' } }
        ]);
        expect(res.headers['x-total-count']).toBe('2');
    });

    it('a preview link for one entry does not open another', async () => {
        vi.mocked(verifyPreviewToken).mockResolvedValue({ ok: true, tokenId: 'pt1', entryId: 'n' });
        vi.mocked(getPublishedEntryForProject).mockResolvedValue(null);
        const other = await request(app)
            .get('/projects/demo/collections/c1/articles/entries/a')
            .set('x-api-key', 'key')
            .set('x-preview-token', 'mpv_testtoken');
        expect(other.status).toBe(404);
        expect(getEntryForProject).not.toHaveBeenCalled();

        vi.mocked(getEntryForProject).mockResolvedValue({
            id: 'n',
            type: 'articles',
            status: 'draft',
            data: {}
        });
        const own = await request(app)
            .get('/projects/demo/collections/c1/articles/entries/n')
            .set('x-api-key', 'key')
            .set('x-preview-token', 'mpv_testtoken');
        expect(own.status).toBe(200);
        expect(own.body.id).toBe('n');
    });

    it.each([
        ['limit=0', /limit/],
        ['limit=5000', /limit/],
        ['limit=abc', /limit/],
        ['offset=-1', /offset/],
        ['sort=title', /sort/]
    ])('rejects %s with 400', async (qs, message) => {
        const res = await request(app)
            .get(`/projects/demo/collections/c1/articles/entries?${qs}`)
            .set('x-api-key', 'key');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(message);
        expect(queryEntriesForProject).not.toHaveBeenCalled();
    });
});

describe('GET /projects/:projectId/collections/:collectionId/openapi.json', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist: null, allowSiteWideReads: true }
        });
    });

    it('returns OpenAPI document for the collection', async () => {
        vi.mocked(getCollection).mockResolvedValue({
            id: 'public',
            projectId: 'demo',
            label: 'Public',
            resources: [{ resourceType: 'model', resourceId: 'articles', fields: ['title'] }],
            createdAt: '',
            updatedAt: ''
        });
        vi.mocked(getModelSchemaForProject).mockResolvedValue({
            id: 'articles',
            label: 'Articles',
            fields: { title: { type: 'core/text', label: 'Title' } }
        });
        const res = await request(app)
            .get('/projects/demo/collections/public/openapi')
            .set('x-api-key', 'key');
        expect(res.status).toBe(200);
        expect(res.body.openapi).toBe('3.0.3');
        expect(res.body.paths).toHaveProperty('/projects/demo/collections/public/articles/entries');
    });

    it('documents every project model when the collection exposes "every model"', async () => {
        vi.mocked(getCollection).mockResolvedValue({
            id: 'public',
            projectId: 'demo',
            label: 'Public',
            resources: [{ resourceType: 'model', resourceId: 'models' }],
            createdAt: '',
            updatedAt: ''
        });
        vi.mocked(listProjectKeys).mockResolvedValue(['issue', 'author']);
        vi.mocked(getModelSchemaForProject).mockImplementation(async (_p, id) => ({
            id,
            label: id,
            fields: { title: { type: 'core/text', label: 'Title' } }
        }));
        const res = await request(app)
            .get('/projects/demo/collections/public/openapi')
            .set('x-api-key', 'key');
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body.paths).toHaveProperty('/projects/demo/collections/public/issue/entries');
        expect(res.body.paths).toHaveProperty('/projects/demo/collections/public/author/entries');
    });

    it('documents menus with the project handles when the collection gives every menu', async () => {
        vi.mocked(getCollection).mockResolvedValue({
            id: 'public',
            projectId: 'demo',
            label: 'Public',
            resources: [{ resourceType: 'menu', resourceId: 'menus' }],
            createdAt: '',
            updatedAt: ''
        });
        vi.mocked(listNavigations).mockResolvedValue([
            { handle: 'main' },
            { handle: 'footer' }
        ] as any);
        const res = await request(app)
            .get('/projects/demo/collections/public/openapi')
            .set('x-api-key', 'key');
        expect(res.status).toBe(200);
        const one = res.body.paths['/projects/demo/collections/public/menus/{handle}'];
        expect(one.get.parameters[0].schema.enum).toEqual(['footer', 'main']);
        expect(res.body.components.schemas).toHaveProperty('Menu');
    });
});

const menus = [
    { id: 'n1', handle: 'main', name: 'Main', items: [] },
    { id: 'n2', handle: 'footer', name: 'Footer', items: [] }
];

function channelWith(resources: Array<{ resourceType: any; resourceId: string }>) {
    return { id: 'c1', projectId: 'demo', label: 'API', resources, createdAt: '', updatedAt: '' };
}

describe('GET /projects/:projectId/collections/:collectionId/menus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist: null, allowSiteWideReads: true }
        });
        vi.mocked(listNavigations).mockResolvedValue(menus as any);
        vi.mocked(getNavigationByHandle).mockImplementation(
            async (_p, handle) => (menus.find(m => m.handle === handle) as any) ?? null
        );
    });

    it('lists every menu, resolved, when the channel gives every menu', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'menu', resourceId: 'menus' }])
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/menus')
            .set('x-api-key', 'k');
        expect(res.status).toBe(200);
        expect(res.body.map((m: any) => m.handle)).toEqual(['main', 'footer']);
        expect(res.body[0].resolved).toBe(true);
    });

    it('lists only the handles the channel names', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'menu', resourceId: 'footer' }])
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/menus')
            .set('x-api-key', 'k');
        expect(res.body.map((m: any) => m.handle)).toEqual(['footer']);
    });

    it('refuses a menu the channel does not give', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'menu', resourceId: 'footer' }])
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/menus/main')
            .set('x-api-key', 'k');
        expect(res.status).toBe(404);
        expect(getNavigationByHandle).not.toHaveBeenCalled();
    });

    it('asks for labels in the requested language', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'menu', resourceId: 'menus' }])
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/menus/main?locale=en')
            .set('x-api-key', 'k');
        expect(res.status).toBe(200);
        expect(resolveNavigation).toHaveBeenCalledWith(
            'demo',
            expect.objectContaining({ handle: 'main' }),
            { locale: 'en', fallback: 'fr' }
        );
    });

    it('returns one menu by handle', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'menu', resourceId: 'menus' }])
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/menus/main')
            .set('x-api-key', 'k');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ handle: 'main', resolved: true });
    });

    it('404s when the channel gives no menus', async () => {
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'model', resourceId: 'models' }])
        );
        const res = await request(app)
            .get('/projects/demo/collections/c1/menus')
            .set('x-api-key', 'k');
        expect(res.status).toBe(404);
    });

    it('needs a key or a session', async () => {
        const res = await request(app).get('/projects/demo/collections/c1/menus');
        expect(res.status).toBe(401);
    });
});

describe('GET /projects/:projectId/collections/:collectionId/forms', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist: null, allowSiteWideReads: true }
        });
        vi.mocked(getCollection).mockResolvedValue(
            channelWith([{ resourceType: 'form', resourceId: 'forms' }])
        );
        vi.mocked(listProjectKeys).mockResolvedValue(['contact', 'old']);
        vi.mocked(getProjectJson).mockImplementation(async (_p, key: string) =>
            key.includes('contact')
                ? ({
                      id: 'contact',
                      label: 'Contact',
                      status: 'active',
                      fields: {},
                      actions: [{ type: 'email', to: 'owner@example.com' }]
                  } as any)
                : ({ id: 'old', label: 'Old', status: 'inactive', fields: {} } as any)
        );
    });

    it('gives only active forms, without actions or recipients', async () => {
        const res = await request(app)
            .get('/projects/demo/collections/c1/forms')
            .set('x-api-key', 'k');
        expect(res.status).toBe(200);
        expect(res.body.map((f: any) => f.id)).toEqual(['contact']);
        expect(res.body[0]).not.toHaveProperty('actions');
    });

    it('404s an inactive form', async () => {
        const res = await request(app)
            .get('/projects/demo/collections/c1/forms/old')
            .set('x-api-key', 'k');
        expect(res.status).toBe(404);
    });
});

describe('page links and page relations on delivery', () => {
    const collection = {
        id: 'site',
        projectId: 'demo',
        label: 'Site',
        resources: [
            { resourceType: 'page' as const, resourceId: 'pages' },
            { resourceType: 'model' as const, resourceId: 'articles' }
        ],
        createdAt: '',
        updatedAt: ''
    };
    const node = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
        id,
        projectId: 'demo',
        type: 'static',
        label: id,
        slug,
        parentId: null,
        order: 0,
        navInclude: true,
        sitemapInclude: true,
        templateId: 'page',
        status: 'published',
        fields: {},
        createdAt: '',
        updatedAt: '',
        ...extra
    });
    const stored: Record<string, unknown> = {
        'pages/home.json': node('home', '', {
            label: 'Home',
            fields: {
                cta: { pageId: 'pricing', label: { en: 'See prices' } },
                more: { pageId: 'soon' },
                related: ['pricing', 'soon']
            }
        }),
        'pages/pricing.json': node('pricing', 'pricing', {
            label: 'Pricing',
            slugs: { fr: 'tarifs' },
            fields: { seo: { title: { en: 'Pricing', fr: 'Tarifs' } } }
        }),
        'pages/soon.json': node('soon', 'soon', { status: 'draft' }),
        'templates/page.json': {
            id: 'page',
            label: 'Page',
            fields: {
                cta: { type: 'core/link', label: 'Call to action' },
                more: { type: 'core/link', label: 'More' },
                related: {
                    type: 'core/relations',
                    label: 'Related',
                    options: { target: 'pages', fields: ['seo'] }
                },
                seo: {
                    type: 'core/object',
                    label: 'SEO',
                    fields: {
                        title: {
                            type: 'core/text',
                            label: 'Title',
                            options: { multilingual: true }
                        }
                    }
                }
            }
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(verifyPreviewToken).mockResolvedValue({ ok: false });
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist: null, allowSiteWideReads: true }
        });
        vi.mocked(getCollection).mockResolvedValue(collection);
        vi.mocked(getProjectById).mockResolvedValue({
            defaultLocale: 'en',
            supportedLocales: ['fr']
        } as any);
        vi.mocked(listProjectKeys).mockImplementation(async (_p, prefix) =>
            Object.keys(stored)
                .filter(k => k.startsWith(prefix))
                .map(k => k.slice(prefix.length))
        );
        vi.mocked(getProjectJson).mockImplementation(
            async (_p, key) => (stored[key] as any) ?? null
        );
    });

    it("gives page links their page's address in each language, and marks a draft target", async () => {
        const res = await request(app)
            .get('/projects/demo/collections/site/pages/home')
            .set('x-api-key', 'valid-key');
        expect(res.status).toBe(200);
        expect(res.body.fields.cta).toEqual({
            pageId: 'pricing',
            label: { en: 'See prices' },
            url: { en: '/pricing', fr: '/fr/tarifs' }
        });
        expect(res.body.fields.more).toEqual({ pageId: 'soon', missing: true });
        expect(res.body.fields.related).toEqual([
            {
                id: 'pricing',
                label: 'Pricing',
                url: { en: '/pricing', fr: '/fr/tarifs' },
                fields: { seo: { title: { en: 'Pricing', fr: 'Tarifs' } } }
            }
        ]);
    });

    it('gives one address with ?locale, in the page list too', async () => {
        const res = await request(app)
            .get('/projects/demo/collections/site/pages?locale=fr')
            .set('x-api-key', 'valid-key');
        expect(res.status).toBe(200);
        const home = res.body.find((p: { id: string }) => p.id === 'home');
        expect(home.fields.cta.url).toBe('/fr/tarifs');
        expect(home.fields.related[0].url).toBe('/fr/tarifs');
    });

    it('brings every field down to the language with ?locale, related pages too', async () => {
        const res = await request(app)
            .get('/projects/demo/collections/site/pages/home?locale=fr')
            .set('x-api-key', 'valid-key');
        expect(res.status).toBe(200);
        // Only in English: the default language stands in.
        expect(res.body.fields.cta.label).toBe('See prices');
        expect(res.body.fields.related[0].fields).toEqual({ seo: { title: 'Tarifs' } });
        const pricing = await request(app)
            .get('/projects/demo/collections/site/pages/pricing?locale=fr')
            .set('x-api-key', 'valid-key');
        expect(pricing.body.fields.seo).toEqual({ title: 'Tarifs' });
    });

    it('resolves page links in entries, by their model', async () => {
        vi.mocked(getModelSchemaForProject).mockResolvedValue({
            id: 'articles',
            label: 'Articles',
            fields: { next: { type: 'core/relation', label: 'Next', options: { target: 'pages' } } }
        } as any);
        vi.mocked(queryEntriesForProject).mockResolvedValue({
            items: [{ id: 'a', type: 'articles', status: 'published', data: { next: 'pricing' } }],
            total: 1
        } as any);
        const res = await request(app)
            .get('/projects/demo/collections/site/articles/entries')
            .set('x-api-key', 'valid-key');
        expect(res.status).toBe(200);
        expect(res.body[0].data.next).toEqual({
            id: 'pricing',
            label: 'Pricing',
            url: { en: '/pricing', fr: '/fr/tarifs' }
        });
    });
});

describe('GET /projects/:projectId/collections/:collectionId/schema and /types', () => {
    const schema = {
        version: 'abc123',
        projectId: 'demo',
        collectionId: 'site',
        defaultLocale: 'en',
        locales: ['en'],
        models: {},
        templates: {},
        blocks: {},
        structures: {}
    };
    const key = (collectionWhitelist: string[] | null) =>
        vi.mocked(verifyProjectApiKey).mockResolvedValue({
            ok: true,
            keyId: 'k1',
            policy: { collectionWhitelist, allowSiteWideReads: true }
        } as never);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(channelSchema).mockResolvedValue(schema as never);
    });

    it('gives the schema to the channel’s key, with its version as ETag', async () => {
        key(['site']);
        const res = await request(app)
            .get('/projects/demo/collections/site/schema')
            .set('x-api-key', 'k');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(schema);
        expect(res.headers.etag).toBe('"abc123"');
        expect(channelSchema).toHaveBeenCalledWith('demo', 'site');
    });

    it('answers 304 when nothing changed', async () => {
        key(['site']);
        const res = await request(app)
            .get('/projects/demo/collections/site/schema')
            .set('x-api-key', 'k')
            .set('If-None-Match', '"abc123"');
        expect(res.status).toBe(304);
    });

    it('gives the types made from it', async () => {
        key(['site']);
        const res = await request(app)
            .get('/projects/demo/collections/site/types')
            .set('x-api-key', 'k');
        expect(res.status).toBe(200);
        expect(res.type).toBe('text/plain');
        expect(res.text).toContain('MoteurSchema');
        expect(res.headers.etag).toBe('"abc123-ts"');
    });

    it('refuses a key for another channel, and 404s an unknown one', async () => {
        key(['blog']);
        const other = await request(app)
            .get('/projects/demo/collections/site/schema')
            .set('x-api-key', 'k');
        expect(other.status).toBe(403);
        key(null);
        vi.mocked(channelSchema).mockResolvedValue(null);
        const missing = await request(app)
            .get('/projects/demo/collections/nope/types')
            .set('x-api-key', 'k');
        expect(missing.status).toBe(404);
    });
});

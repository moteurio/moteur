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
vi.mock('@moteurio/core/entries.js', () => ({
    queryEntriesForProject: vi.fn(),
    getEntryForProject: vi.fn(),
    getPublishedEntryForProject: vi.fn()
}));
vi.mock('@moteurio/core/navigations.js', () => ({
    listNavigations: vi.fn(),
    getNavigationByHandle: vi.fn(),
    resolveNavigation: vi.fn(async (_p: string, nav: any) => ({ ...nav, resolved: true }))
}));
vi.mock('@moteurio/core/projects.js', () => ({
    getProjectById: vi.fn(async () => ({ defaultLocale: 'fr' }))
}));

import { listCollections, getCollection } from '@moteurio/core/apiCollections.js';
import { verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
import { queryEntriesForProject } from '@moteurio/core/entries.js';
import {
    listNavigations,
    getNavigationByHandle,
    resolveNavigation
} from '@moteurio/core/navigations.js';
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
        expect(queryEntriesForProject).toHaveBeenCalledWith('demo', 'articles', {
            view: 'published',
            status: ['published']
        });
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

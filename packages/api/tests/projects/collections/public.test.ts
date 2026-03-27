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

import { listCollections, getCollection } from '@moteurio/core/apiCollections.js';
import { verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
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

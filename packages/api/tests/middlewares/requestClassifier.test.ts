import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requestClassifier } from '../../src/middlewares/requestClassifier.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
    requestClassifier(req, _res, next);
});
app.use((req, res) => {
    res.json({
        type: (req as any).apiRequestType,
        projectId: (req as any).apiRequestProjectId
    });
});

describe('requestClassifier', () => {
    it('sets studio for path containing /studio/', async () => {
        const res = await request(app).get('/api/studio/usage');
        expect(res.body.type).toBe('studio');
        expect(res.body.projectId).toBeUndefined();
    });

    it('sets public and projectId for /projects/:id/collections', async () => {
        const res = await request(app).get('/api/projects/my-blog/collections');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('my-blog');
    });

    it('sets public and projectId for /projects/:id/collections/:cid/entries', async () => {
        const res = await request(app).get('/api/projects/demo/collections/c1/blog/entries');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('demo');
    });

    it('sets public and projectId for /projects/:id/pages', async () => {
        const res = await request(app).get('/projects/foo/pages');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('foo');
    });

    it('sets public and projectId for /projects/:id/templates', async () => {
        const res = await request(app).get('/projects/bar/templates');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('bar');
    });

    it('sets public and projectId for /projects/:id/forms', async () => {
        const res = await request(app).get('/projects/site1/forms');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('site1');
    });

    it('sets public and projectId for /projects/:id/forms/:formId and submit', async () => {
        const resGet = await request(app).get('/projects/site1/forms/contact');
        expect(resGet.body.type).toBe('public');
        expect(resGet.body.projectId).toBe('site1');
        const resSubmit = await request(app).post('/projects/site1/forms/contact/submit');
        expect(resSubmit.body.type).toBe('public');
        expect(resSubmit.body.projectId).toBe('site1');
    });

    it('sets null type for non-studio non-public path', async () => {
        const res = await request(app).get('/api/auth/login');
        expect(res.body.type).toBeNull();
        expect(res.body.projectId).toBeUndefined();
    });

    it('strips query string before matching', async () => {
        const res = await request(app).get('/api/projects/p1/collections?foo=bar');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('p1');
    });
});

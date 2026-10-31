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

    it('sets public and projectId for /projects/:id/channels', async () => {
        const res = await request(app).get('/api/projects/my-blog/channels');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('my-blog');
    });

    it('sets public and projectId for /projects/:id/channels/:cid/entries', async () => {
        const res = await request(app).get('/api/projects/demo/channels/c1/blog/entries');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('demo');
    });

    it.each([
        '/projects/foo/pages',
        '/projects/bar/templates',
        '/projects/s/forms/contact',
        '/projects/s/navigations'
    ])('leaves Studio reads (%s) unclassified', async path => {
        const res = await request(app).get(path);
        expect(res.body.type).toBeNull();
    });

    it('sets public and projectId for form submissions', async () => {
        const res = await request(app).post('/projects/site1/forms/contact/submit');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('site1');
    });

    it("counts what plugins give sites (a poll's votes) as the project's public traffic", async () => {
        const res = await request(app).post('/projects/site1/play/polls/lunch/vote');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('site1');
    });

    it('sets public for page outputs', async () => {
        const res = await request(app).get('/projects/site1/sitemap.xml');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('site1');
    });

    it('counts what sites call to find a path, and reading redirects, but not changing them', async () => {
        expect((await request(app).get('/projects/site1/resolve?path=/fr')).body.type).toBe(
            'public'
        );
        expect((await request(app).get('/projects/site1/redirects')).body.type).toBe('public');
        expect((await request(app).post('/projects/site1/redirects')).body.type).toBeNull();
        expect((await request(app).delete('/projects/site1/redirects/r1')).body.type).toBeNull();
    });

    it('sets null type for non-studio non-public path', async () => {
        const res = await request(app).get('/api/auth/login');
        expect(res.body.type).toBeNull();
        expect(res.body.projectId).toBeUndefined();
    });

    it('strips query string before matching', async () => {
        const res = await request(app).get('/api/projects/p1/channels?foo=bar');
        expect(res.body.type).toBe('public');
        expect(res.body.projectId).toBe('p1');
    });
});

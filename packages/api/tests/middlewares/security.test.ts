import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { securityHeaders } from '../../src/middlewares/security.js';

describe('securityHeaders', () => {
    const initial: { NODE_ENV?: string; HELMET_DISABLED?: string } = {};

    beforeAll(() => {
        initial.NODE_ENV = process.env.NODE_ENV;
        initial.HELMET_DISABLED = process.env.HELMET_DISABLED;
    });

    afterEach(() => {
        if (initial.NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = initial.NODE_ENV;
        if (initial.HELMET_DISABLED === undefined) delete process.env.HELMET_DISABLED;
        else process.env.HELMET_DISABLED = initial.HELMET_DISABLED;
    });

    function appWithSecurity() {
        const app = express();
        app.use(securityHeaders);
        app.get('/', (_req, res) => res.send('ok'));
        return app;
    }

    it('applies Helmet when HELMET_DISABLED is unset', async () => {
        delete process.env.HELMET_DISABLED;
        const res = await request(appWithSecurity()).get('/');
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('ignores HELMET_DISABLED=1 when NODE_ENV is production', async () => {
        process.env.NODE_ENV = 'production';
        process.env.HELMET_DISABLED = '1';
        const res = await request(appWithSecurity()).get('/');
        expect(res.headers['x-dns-prefetch-control']).toBe('off');
    });

    it('skips Helmet when HELMET_DISABLED=1 and NODE_ENV is not production', async () => {
        process.env.NODE_ENV = 'test';
        process.env.HELMET_DISABLED = '1';
        const res = await request(appWithSecurity()).get('/');
        expect(res.headers['x-dns-prefetch-control']).toBeUndefined();
    });
});

import request from 'supertest';
import express from 'express';
import { describe, it, expect } from 'vitest';
import { createProvidersRoute } from '../../src/auth/providers';

describe('GET /auth/providers', () => {
    it('should return both GitHub and Google if both are enabled', async () => {
        const app = express();
        app.use(
            '/auth',
            createProvidersRoute([
                { id: 'github', label: 'GitHub', enabled: true },
                { id: 'google', label: 'Google', enabled: true }
            ])
        );

        const res = await request(app).get('/auth/providers');
        expect(res.status).toBe(200);
        expect(res.body.providers).toEqual([
            { id: 'github', label: 'GitHub' },
            { id: 'google', label: 'Google' }
        ]);
    });

    it('should return only GitHub if Google is disabled', async () => {
        const app = express();
        app.use(
            '/auth',
            createProvidersRoute([
                { id: 'github', label: 'GitHub', enabled: true },
                { id: 'google', label: 'Google', enabled: false }
            ])
        );

        const res = await request(app).get('/auth/providers');
        expect(res.status).toBe(200);
        expect(res.body.providers).toEqual([{ id: 'github', label: 'GitHub' }]);
    });

    it('should dedupe providers by id and keep first label', async () => {
        const app = express();
        app.use(
            '/auth',
            createProvidersRoute([
                { id: 'github', label: 'GitHub', enabled: true },
                { id: 'github', label: 'GitHub Duplicate', enabled: true }
            ])
        );

        const res = await request(app).get('/auth/providers');
        expect(res.status).toBe(200);
        expect(res.body.providers).toEqual([{ id: 'github', label: 'GitHub' }]);
    });

    it('should return an empty array if none are enabled', async () => {
        const app = express();
        app.use(
            '/auth',
            createProvidersRoute([
                { id: 'github', label: 'GitHub', enabled: false },
                { id: 'google', label: 'Google', enabled: false }
            ])
        );

        const res = await request(app).get('/auth/providers');
        expect(res.status).toBe(200);
        expect(res.body.providers).toEqual([]);
    });
});

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createStatusRouter } from '../src/routes/status.js';
import { setAdapter } from '../src/adapter.js';
import { MockAdapter } from '../src/providers/MockAdapter.js';

const requireAuth = (req: any, _res: any, next: () => void) => {
    req.user = { id: 'u1' };
    next();
};

describe('status route', () => {
    const previousProvider = process.env.MOTEUR_AI_PROVIDER;
    const previousCreditsDisabled = process.env.MOTEUR_AI_CREDITS_DISABLED;

    afterEach(() => {
        setAdapter(null);
        process.env.MOTEUR_AI_PROVIDER = previousProvider;
        process.env.MOTEUR_AI_CREDITS_DISABLED = previousCreditsDisabled;
    });

    it('returns enabled true with configured provider and adapter', async () => {
        process.env.MOTEUR_AI_PROVIDER = 'mock-provider';
        process.env.MOTEUR_AI_CREDITS_DISABLED = 'true';
        setAdapter(new MockAdapter());

        const app = express();
        app.use(createStatusRouter({ requireAuth } as any));

        const res = await request(app).get('/status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            enabled: true,
            textProvider: 'mock-provider',
            creditsGloballyDisabled: true
        });
    });

    it('returns enabled false and null provider when AI is not configured', async () => {
        delete process.env.MOTEUR_AI_PROVIDER;
        delete process.env.MOTEUR_AI_CREDITS_DISABLED;
        setAdapter(null);

        const app = express();
        app.use(createStatusRouter({ requireAuth } as any));

        const res = await request(app).get('/status');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            enabled: false,
            textProvider: null,
            creditsGloballyDisabled: false
        });
    });
});

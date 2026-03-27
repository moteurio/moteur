import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createSettingsOverviewRouter } from '../src/routes/settingsOverview.js';
import { setAdapter } from '../src/adapter.js';
import { MockAdapter } from '../src/providers/MockAdapter.js';
import { setCredits } from '../src/credits.js';

const requireAuth = (req: any, _res: any, next: () => void) => {
    req.user = { id: 'u1' };
    next();
};
const requireProjectAccess = (_req: any, _res: any, next: () => void) => next();

describe('settings overview route', () => {
    const previousProvider = process.env.MOTEUR_AI_PROVIDER;
    const previousCreditsDisabled = process.env.MOTEUR_AI_CREDITS_DISABLED;

    afterEach(() => {
        setAdapter(null);
        process.env.MOTEUR_AI_PROVIDER = previousProvider;
        process.env.MOTEUR_AI_CREDITS_DISABLED = previousCreditsDisabled;
    });

    it('returns provider flags and project credits', async () => {
        process.env.MOTEUR_AI_PROVIDER = 'mock-provider';
        delete process.env.MOTEUR_AI_CREDITS_DISABLED;
        setAdapter(new MockAdapter());
        setCredits('project-1', 321);

        const app = express();
        app.use(createSettingsOverviewRouter({ requireAuth, requireProjectAccess } as any));

        const res = await request(app).get('/settings/project-1');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            textAi: { enabled: true, provider: 'mock-provider' },
            credits: { remaining: 321, unlimited: false }
        });
    });

    it('returns unlimited credits when globally disabled', async () => {
        delete process.env.MOTEUR_AI_PROVIDER;
        process.env.MOTEUR_AI_CREDITS_DISABLED = '1';
        setAdapter(null);

        const app = express();
        app.use(createSettingsOverviewRouter({ requireAuth, requireProjectAccess } as any));

        const res = await request(app).get('/settings/project-2');
        expect(res.status).toBe(200);
        expect(res.body.textAi).toEqual({ enabled: false, provider: null });
        expect(res.body.credits).toEqual({ remaining: 1_000_000, unlimited: true });
    });
});

import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const project = (ai: Record<string, unknown> = {}) => ({
    id: 'p1',
    label: 'Journal',
    defaultLocale: 'fr',
    supportedLocales: ['en'],
    users: ['u1'],
    ai
});
let current = project();
vi.mock('@moteurio/core/projects.js', () => ({ getProject: vi.fn(async () => current) }));
vi.mock('@moteurio/core/assets/assetService.js', () => ({
    getAsset: vi.fn(async (_p: string, id: string) =>
        id === 'pic' ? { id, type: 'image', url: 'https://cdn.test/pic.png' } : null
    )
}));
vi.mock('@moteurio/core/aiAuditLogger.js', () => ({ appendAiAuditEvent: vi.fn() }));

import { createAiRouter, setAdapter, MockAdapter, setCredits } from '@moteurio/ai';
import { appendAiAuditEvent } from '@moteurio/core/aiAuditLogger.js';

let roles = ['writer'];
const app = express();
app.use(express.json());
app.use(
    '/ai',
    createAiRouter({
        requireAuth: (_req: any, _res: any, next: () => void) => next(),
        requireProjectAccess: (req: any, _res: any, next: () => void) => {
            req.user = { id: 'u1', name: 'Sophie', roles };
            next();
        },
        requireOperator: (_req: any, _res: any, next: () => void) => next()
    } as any)
);

const allOn = { helpers: { write: true, translate: true, alt: true } };

describe('AI helpers for the Studio', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('MOTEUR_AI_CREDITS_DISABLED', '');
        setAdapter(new MockAdapter());
        setCredits('p1', 100);
        roles = ['writer'];
        current = project(allOn);
    });

    it('says which helpers this person may use: off by default, roles respected', async () => {
        current = project({ helpers: { write: true } });
        const res = await request(app).get('/ai/helpers/p1');
        expect(res.status).toBe(200);
        expect(res.body.helpers).toEqual({
            write: 'ok',
            translate: 'off',
            alt: 'off',
            notes: 'off',
            images: 'off'
        });
        expect(res.body.ready).toBe(true);
        expect(res.body.costs['write.shorten']).toBe(2);
        roles = ['reviewer'];
        expect((await request(app).get('/ai/helpers/p1')).body.helpers.write).toBe('ok');
        roles = ['billing'];
        expect((await request(app).get('/ai/helpers/p1')).body.helpers.write).toBe('role');
        current = project({ helpers: { write: true, translate: true } });
        roles = ['translator'];
        const translating = (await request(app).get('/ai/helpers/p1')).body.helpers;
        expect(translating.translate).toBe('ok');
        expect(translating.write).toBe('role');
    });

    it('suggests text, takes credits only then, and logs the use', async () => {
        const res = await request(app)
            .post('/ai/write')
            .send({
                projectId: 'p1',
                action: 'shorten',
                value: 'Un très long paragraphe.',
                locale: 'fr',
                field: { key: 'excerpt', label: 'Excerpt', type: 'core/textarea' }
            });
        expect(res.status).toBe(200);
        expect(res.body.text).toMatch(/^\[mock:/);
        expect(res.body).toMatchObject({ creditsUsed: 2, creditsRemaining: 98 });
        expect(appendAiAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'write.shorten',
                success: true,
                fieldPath: 'excerpt'
            })
        );
    });

    it('refuses a helper that is off, a role that may not, and empty credits', async () => {
        current = project({ helpers: { translate: true } });
        const off = await request(app)
            .post('/ai/write')
            .send({ projectId: 'p1', action: 'shorten', value: 'x', field: { key: 'title' } });
        expect(off.status).toBe(403);
        expect(off.body.code).toBe('AI_HELPER_OFF');

        current = project(allOn);
        roles = ['billing'];
        const role = await request(app)
            .post('/ai/translate/field')
            .send({ projectId: 'p1', value: 'Bonjour', from: 'fr', to: 'en' });
        expect(role.body.code).toBe('AI_HELPER_ROLE');

        roles = ['writer'];
        setCredits('p1', 0);
        const broke = await request(app)
            .post('/ai/translate/field')
            .send({ projectId: 'p1', value: 'Bonjour', from: 'fr', to: 'en' });
        expect(broke.status).toBe(402);
        expect(broke.body.code).toBe('INSUFFICIENT_CREDITS');
    });

    it('translates a field and describes a picture', async () => {
        const t = await request(app)
            .post('/ai/translate/field')
            .send({
                projectId: 'p1',
                value: 'Bonjour',
                from: 'fr',
                to: 'en',
                field: { key: 'title', type: 'core/text' }
            });
        expect(t.status).toBe(200);
        expect(t.body.text).toMatch(/^\[mock:/);
        expect(t.body.creditsUsed).toBe(1);

        const pic = await request(app)
            .post('/ai/analyse/image')
            .send({ projectId: 'p1', assetId: 'pic', locale: 'en' });
        expect(pic.status).toBe(200);
        expect(pic.body.alt).toMatch(/^\[mock image/);
        expect(
            (
                await request(app)
                    .post('/ai/analyse/image')
                    .send({ projectId: 'p1', assetId: 'nope' })
            ).status
        ).toBe(404);
    });

    it('explains bad requests', async () => {
        const res = await request(app)
            .post('/ai/write')
            .send({ projectId: 'p1', action: 'magic', field: { key: 'title' } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('"action"');
    });
});

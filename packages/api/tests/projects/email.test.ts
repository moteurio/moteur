import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The project as stored; the routes read and write it through core's projects. */
let stored: Record<string, unknown>;
let roles: string[];
vi.mock('../../src/middlewares/auth.js', () => {
    const member = (req: any, _res: any, next: any) => {
        req.user = { id: 'u1', roles };
        req.project = stored;
        next();
    };
    return {
        requireProjectAccess: member
    };
});
vi.mock('@moteurio/core/projects.js', () => ({
    getProject: vi.fn(async () => stored),
    updateProject: vi.fn(async (_u: unknown, _id: string, patch: Record<string, unknown>) => {
        stored = { ...stored, ...patch };
        if (patch.email === null) delete stored.email;
        return stored;
    })
}));

import router from '../../src/projects/email.js';

const app = express();
app.use(express.json());
app.use('/projects', router);

describe('a project’s own mail', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-project-email-'));
        vi.stubEnv('DATA_ROOT', dir);
        vi.stubEnv('SMTP_FROM', 'Moteur <mail@moteur.io>');
        stored = {
            id: 'olimpico',
            label: 'Olimpico',
            defaultLocale: 'fr',
            siteUrl: 'https://olimpico.example'
        };
        roles = ['admin'];
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('shows what goes out: the project’s name on the server’s address', async () => {
        const res = await request(app).get('/projects/olimpico/email');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            settings: {},
            effective: {
                senderName: 'Olimpico',
                from: '"Olimpico" <mail@moteur.io>',
                fromAddress: 'mail@moteur.io',
                siteUrl: 'https://olimpico.example'
            },
            sendingDomains: [],
            credit: null,
            canEdit: true
        });
    });

    it('lets an admin change it, refusing what can’t be used', async () => {
        const res = await request(app).patch('/projects/olimpico/email').send({
            senderName: 'Café Olimpico',
            replyTo: 'bonjour@olimpico.example',
            accent: '#8a3b12',
            footer: '124, rue Saint-Viateur O.\nMontréal QC'
        });
        expect(res.status).toBe(200);
        expect(res.body.effective).toMatchObject({
            senderName: 'Café Olimpico',
            from: '"Café Olimpico" <mail@moteur.io>',
            replyTo: 'bonjour@olimpico.example',
            accent: '#8A3B12'
        });
        expect(stored.email).toMatchObject({ senderName: 'Café Olimpico' });

        const own = await request(app)
            .patch('/projects/olimpico/email')
            .send({ fromAddress: 'bonjour@olimpico.example' });
        expect(own.status).toBe(400);
        expect(own.body.error).toMatch(/sends from its own address only/);
        const light = await request(app)
            .patch('/projects/olimpico/email')
            .send({ accent: '#F5D76E' });
        expect(light.status).toBe(400);

        const cleared = await request(app)
            .patch('/projects/olimpico/email')
            .send({ senderName: null, replyTo: '', accent: null, footer: null });
        expect(cleared.body.settings).toEqual({});
        expect(stored.email).toBeUndefined();
    });

    it('lets admins, builders, developers and leads change it, and every member preview it', async () => {
        for (const role of ['builder', 'developer', 'lead']) {
            roles = [role];
            expect((await request(app).get('/projects/olimpico/email')).body.canEdit).toBe(true);
            expect(
                (await request(app).patch('/projects/olimpico/email').send({ senderName: 'X' }))
                    .status
            ).toBe(200);
        }
        for (const role of ['writer', 'reviewer', 'translator', 'billing']) {
            roles = [role];
            expect((await request(app).get('/projects/olimpico/email')).body.canEdit).toBe(false);
            expect(
                (await request(app).patch('/projects/olimpico/email').send({ senderName: 'X' }))
                    .status
            ).toBe(403);
        }
        roles = ['writer'];
        delete stored.email;
        const preview = await request(app)
            .post('/projects/olimpico/email/preview')
            .send({ locale: 'en', settings: { senderName: 'Café Olimpico', accent: '#8A3B12' } });
        expect(preview.status).toBe(200);
        expect(preview.body).toMatchObject({
            kind: 'form-confirm',
            locale: 'en',
            subject: 'Thanks for your message',
            from: '"Café Olimpico" <mail@moteur.io>'
        });
        expect(preview.body.html).toContain('Café Olimpico');
        expect(preview.body.html).toContain('color:#8A3B12');
        expect(preview.body.html).not.toContain('Moteur');
        // The draft is shown, never kept.
        expect(stored.email).toBeUndefined();
        const bad = await request(app)
            .post('/projects/olimpico/email/preview')
            .send({ settings: { accent: '#F5D76E' } });
        expect(bad.status).toBe(400);
        const message = await request(app)
            .post('/projects/olimpico/email/preview')
            .send({ kind: 'form-message' });
        expect(message.body).toMatchObject({ kind: 'form-message', locale: 'fr' });
    });
});

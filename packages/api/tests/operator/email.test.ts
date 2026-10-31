import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import { reloadUsers, getUserById } from '@moteurio/core/users.js';
import { unsubscribeUrl } from '@moteurio/core/email/unsubscribe.js';
import emailRouter from '../../src/operator/email.js';
import emailPreferences from '../../src/auth/emailPreferences.js';

function app() {
    const a = express();
    a.use(express.json());
    // requireOperator runs before this router in the API; here, a stand-in operator.
    a.use('/operator/email', (req, _res, next) => {
        req.operator = { email: 'ops@moteur.io' } as never;
        next();
    });
    a.use('/operator/email', emailRouter);
    a.use('/auth', emailPreferences);
    return a;
}

describe('the server’s email, for its operator', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-op-email-'));
        vi.stubEnv('DATA_ROOT', dir);
        vi.stubEnv('AUTH_USERS_FILE', path.join(dir, 'users.json'));
        vi.stubEnv('JWT_SECRET', 'test-secret');
        vi.stubEnv('SMTP_HOST', '');
        vi.stubEnv('SMTP_FROM', '');
        fs.writeFileSync(
            path.join(dir, 'users.json'),
            JSON.stringify([
                { id: 'u1', email: 'l@a.test', isActive: true, roles: [], projects: [] }
            ])
        );
        reloadUsers();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('shows the settings and changes them, refusing what can’t be used', async () => {
        const first = await request(app()).get('/operator/email');
        expect(first.status).toBe(200);
        expect(first.body.effective).toMatchObject({ productName: 'Moteur', look: 'discotheque' });
        expect(first.body.transport.configured).toBe(false);
        expect(first.body.kinds).toContain('signin');

        const changed = await request(app())
            .patch('/operator/email')
            .send({ productName: 'Atelier', look: 'folio', footer: 'Atelier inc.\nMontréal' });
        expect(changed.status).toBe(200);
        expect(changed.body.settings).toMatchObject({
            productName: 'Atelier',
            updatedBy: 'ops@moteur.io'
        });

        const bad = await request(app()).patch('/operator/email').send({ accent: '#FFE680' });
        expect(bad.status).toBe(400);
        expect(bad.body.error).toMatch(/too light/);
    });

    it('previews every email with sample data, in HTML, text or both', async () => {
        const html = await request(app()).get('/operator/email/preview/signin?look=folio');
        expect(html.status).toBe(200);
        expect(html.headers['content-type']).toMatch(/text\/html/);
        expect(html.text).toContain('482');
        const text = await request(app()).get(
            '/operator/email/preview/invite?format=text&locale=fr'
        );
        expect(text.headers['content-type']).toMatch(/text\/plain/);
        expect(text.text).toContain('Rejoindre');
        const both = await request(app()).get(
            '/operator/email/preview/review?format=json&look=discotheque'
        );
        expect(both.body).toMatchObject({ kind: 'review', design: 'disco-marquee', locale: 'en' });
        const second = await request(app()).get(
            '/operator/email/preview/invite?format=json&variant=b&look=folio'
        );
        expect(second.body).toMatchObject({ kind: 'invite', design: 'folio-tab', variant: 'b' });
        expect((await request(app()).get('/operator/email/preview/nope')).status).toBe(404);
    });

    it('checks what it can, and says mail isn’t set up', async () => {
        const res = await request(app()).post('/operator/email/check').send({});
        expect(res.status).toBe(200);
        expect(res.body.checks[0]).toMatchObject({ id: 'setup', status: 'fail' });
        expect(
            (await request(app()).post('/operator/email/check').send({ to: 'nope' })).status
        ).toBe(400);
    });

    it('lets a person stop review emails from the link, never on a bare visit', async () => {
        vi.stubEnv('MOTEUR_API_URL', 'https://api.moteur.io');
        const url = new URL(unsubscribeUrl('u1', 'reviews')!);
        const page = await request(app()).get(`/auth/email/unsubscribe${url.search}`);
        expect(page.status).toBe(200);
        expect(page.text).toContain('<form method="post">');
        reloadUsers();
        expect(getUserById('u1')!.preferences).toBeUndefined();

        const forged = await request(app()).get('/auth/email/unsubscribe?u=u1&t=reviews&s=nope');
        expect(forged.status).toBe(400);

        // What a mail app sends for one-click unsubscribe (RFC 8058).
        const oneClick = await request(app())
            .post(`/auth/email/unsubscribe${url.search}`)
            .type('form')
            .send('List-Unsubscribe=One-Click');
        expect(oneClick.status).toBe(200);
        expect(oneClick.body).toEqual({ unsubscribed: 'reviews' });
        reloadUsers();
        expect(getUserById('u1')!.preferences?.emails?.reviews).toBe(false);
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import { reloadUsers, getUserById } from '@moteurio/core/users.js';
import { unsubscribeUrl } from '@moteurio/core/email/unsubscribe.js';
// DNS is the world's: the domain checks are stood in for here (core tests them with a fake DNS).
const { checkSendingDomain, runDomainCheck } = vi.hoisted(() => ({
    checkSendingDomain: vi.fn(),
    runDomainCheck: vi.fn()
}));
vi.mock('@moteurio/core/email/check.js', async importOriginal => ({
    ...(await importOriginal<typeof import('@moteurio/core/email/check.js')>()),
    checkSendingDomain,
    runDomainCheck
}));
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
        expect(first.body.effective).toMatchObject({
            productName: 'Moteur',
            look: 'recipient',
            defaultLook: 'discotheque',
            sendingDomains: [],
            projectCredit: false
        });
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

    it('adds a sending domain only when its DNS passes the check', async () => {
        checkSendingDomain.mockResolvedValueOnce({
            domain: 'olimpico.example',
            passes: false,
            checks: [
                { id: 'dkim', status: 'warn', message: 'No DKIM key found.' },
                { id: 'dmarc', status: 'fail', message: 'No DMARC record.' }
            ]
        });
        const refused = await request(app())
            .patch('/operator/email')
            .send({ sendingDomains: ['olimpico.example'], projectCredit: true });
        expect(refused.status).toBe(400);
        expect(refused.body.error).toMatch(/olimpico\.example can’t be a sending domain yet/);
        expect(refused.body.error).toContain('No DMARC record.');
        expect(refused.body.error).toContain('No DKIM key found.');

        checkSendingDomain.mockResolvedValueOnce({
            domain: 'olimpico.example',
            passes: true,
            checks: []
        });
        const added = await request(app())
            .patch('/operator/email')
            .send({ sendingDomains: 'olimpico.example', projectCredit: true });
        expect(added.status).toBe(200);
        expect(added.body.effective).toMatchObject({
            sendingDomains: ['olimpico.example'],
            projectCredit: true
        });
        // Domains already on the list aren't checked again.
        checkSendingDomain.mockClear();
        await request(app())
            .patch('/operator/email')
            .send({ sendingDomains: ['olimpico.example'] });
        expect(checkSendingDomain).not.toHaveBeenCalled();
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
        const invite = await request(app()).get(
            '/operator/email/preview/invite?format=json&look=folio'
        );
        expect(invite.body).toMatchObject({ kind: 'invite', design: 'folio-tab' });
        expect(invite.body.variant).toBeUndefined();
        // A project's own mail keeps its own design, whatever the look asked.
        const confirm = await request(app()).get(
            '/operator/email/preview/form-confirm?format=json&look=folio'
        );
        expect(confirm.body).toMatchObject({ design: 'project-plain', look: 'project' });
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

    it('checks a domain projects would send from', async () => {
        runDomainCheck.mockResolvedValueOnce({
            passes: true,
            checks: [{ id: 'sending-domain-dns', status: 'ok', message: 'ok' }]
        });
        const res = await request(app())
            .post('/operator/email/check')
            .send({ domain: 'olimpico.example' });
        expect(res.status).toBe(200);
        expect(runDomainCheck).toHaveBeenCalledWith('olimpico.example', { selectors: [] });
        expect(
            (await request(app()).post('/operator/email/check').send({ domain: 'not a domain' }))
                .status
        ).toBe(400);
        expect(
            (await request(app()).post('/operator/email/check').send({ project: 'nope' })).status
        ).toBe(404);
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

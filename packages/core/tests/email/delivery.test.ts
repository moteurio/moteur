import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { buildMessage, dkimConfig, mailUnavailable } from '../../src/email/transport.js';
import { resolveEmailSettings } from '../../src/email/settings.js';
import { baseDomain, checkDns, type Resolver } from '../../src/email/check.js';
import {
    checkUnsubscribe,
    setEmailTopic,
    unsubscribeUrl,
    updatePreferences,
    wantsEmail
} from '../../src/email/unsubscribe.js';
import { getUserById, reloadUsers } from '../../src/users.js';

const settings = {
    ...resolveEmailSettings({}),
    fromName: 'Moteur',
    fromAddress: 'signin@moteur.io'
};

describe('what goes out with every email', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('says it is automated, from one name and address, with its own Message-ID', () => {
        const m = buildMessage(
            { to: ['a@b.test'], subject: 'S', text: 'T', html: '<p>T</p>', category: 'auth' },
            settings
        );
        expect(m.from).toBe('"Moteur" <signin@moteur.io>');
        expect(m.messageId).toMatch(/^<[0-9a-f-]{36}@moteur\.io>$/);
        expect(m.headers).toEqual({
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'OOF, AutoReply'
        });
        expect(m.text).toBe('T');
        expect(m.html).toBe('<p>T</p>');
        expect(m).not.toHaveProperty('replyTo');
    });

    it('offers one-click unsubscribe on notifications only', () => {
        const url = 'https://api.moteur.io/auth/email/unsubscribe?u=1&t=reviews&s=x';
        const note = buildMessage(
            {
                to: ['a@b.test'],
                subject: 'S',
                text: 'T',
                category: 'notification',
                unsubscribe: url
            },
            settings
        );
        expect(note.headers['List-Unsubscribe']).toBe(`<${url}>`);
        expect(note.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
        const code = buildMessage(
            { to: ['a@b.test'], subject: 'S', text: 'T', category: 'auth', unsubscribe: url },
            settings
        );
        expect(code.headers).not.toHaveProperty('List-Unsubscribe');
    });

    it('replies where asked, names a project’s mail after it, bounces to the return path', () => {
        vi.stubEnv('SMTP_RETURN_PATH', 'bounces@mail.moteur.io');
        const m = buildMessage(
            {
                to: ['a@b.test'],
                subject: 'S',
                text: 'T',
                category: 'project',
                fromName: 'Journal "du" <Plateau>',
                replyTo: 'lise@courriel.test'
            },
            { ...settings, replyTo: 'help@moteur.io' }
        );
        expect(m.from).toBe('"Journal du Plateau" <signin@moteur.io>');
        expect(m.replyTo).toBe('lise@courriel.test');
        expect(m.envelope).toEqual({ from: 'bounces@mail.moteur.io', to: ['a@b.test'] });
        const operatorsReply = buildMessage(
            { to: ['a@b.test'], subject: 'S', text: 'T', category: 'auth' },
            { ...settings, replyTo: 'help@moteur.io' }
        );
        expect(operatorsReply.replyTo).toBe('help@moteur.io');
    });

    it('signs with DKIM when given a key, read from one line or a file', () => {
        expect(dkimConfig()).toBeNull();
        vi.stubEnv('MOTEUR_DKIM_DOMAIN', 'moteur.io');
        vi.stubEnv('MOTEUR_DKIM_SELECTOR', 'mail');
        vi.stubEnv('MOTEUR_DKIM_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END');
        expect(dkimConfig()).toEqual({
            domainName: 'moteur.io',
            keySelector: 'mail',
            privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END'
        });
    });

    it('says why mail can’t go out', () => {
        vi.stubEnv('SMTP_HOST', '');
        expect(mailUnavailable(settings)).toMatch(/SMTP_HOST/);
        vi.stubEnv('SMTP_HOST', 'smtp.example.com');
        expect(mailUnavailable({ ...settings, fromAddress: '' })).toMatch(/From address/);
        expect(mailUnavailable(settings)).toBeNull();
    });
});

/** A DNS that answers from a table. */
function fakeDns(txt: Record<string, string[]>, mx: Record<string, string[]> = {}): Resolver {
    return {
        txt: async name => txt[name] ?? [],
        mx: async name => mx[name] ?? []
    };
}
const statusOf = (checks: { id: string; status: string }[], id: string) =>
    checks.find(c => c.id === id)?.status;

describe('the DNS check', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('finds a sound setup', async () => {
        const checks = await checkDns('moteur.io', {
            resolver: fakeDns(
                {
                    'moteur.io': [
                        'v=spf1 include:spf.mtasv.net ~all',
                        'google-site-verification=x'
                    ],
                    '_dmarc.moteur.io': ['v=DMARC1; p=quarantine; rua=mailto:d@moteur.io'],
                    'pm._domainkey.moteur.io': ['k=rsa; p=MIGf']
                },
                { 'moteur.io': ['mx.moteur.io'] }
            )
        });
        expect(checks.map(c => `${c.id}:${c.status}`)).toEqual([
            'spf:ok',
            'dmarc:ok',
            'dkim:ok',
            'mx:ok'
        ]);
        expect(checks.find(c => c.id === 'dkim')!.message).toContain('pm');
    });

    it('says what is missing or wrong', async () => {
        const none = await checkDns('moteur.io', { resolver: fakeDns({}) });
        expect(none.map(c => `${c.id}:${c.status}`)).toEqual([
            'spf:fail',
            'dmarc:fail',
            'dkim:warn',
            'mx:warn'
        ]);
        const twice = await checkDns('moteur.io', {
            resolver: fakeDns({ 'moteur.io': ['v=spf1 -all', 'v=spf1 include:x ~all'] })
        });
        expect(statusOf(twice, 'spf')).toBe('fail');
        const open = await checkDns('moteur.io', {
            resolver: fakeDns({
                'moteur.io': ['v=spf1 +all'],
                '_dmarc.moteur.io': ['v=DMARC1; p=none']
            })
        });
        expect(statusOf(open, 'spf')).toBe('warn');
        expect(statusOf(open, 'dmarc')).toBe('warn');
    });

    it('reads DMARC from the domain a sending subdomain belongs to', async () => {
        const checks = await checkDns('mail.moteur.io', {
            resolver: fakeDns({ '_dmarc.moteur.io': ['v=DMARC1; p=reject'] })
        });
        expect(statusOf(checks, 'dmarc')).toBe('ok');
        expect(baseDomain('mail.moteur.io')).toBe('moteur.io');
        expect(baseDomain('mail.agence.qc.ca')).toBe('agence.qc.ca');
    });

    it('compares the engine’s own DKIM key with the one DNS publishes', async () => {
        const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
        const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
        const p = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        vi.stubEnv('MOTEUR_DKIM_DOMAIN', 'moteur.io');
        vi.stubEnv('MOTEUR_DKIM_SELECTOR', 'mail');
        vi.stubEnv('MOTEUR_DKIM_PRIVATE_KEY', pem);
        const same = await checkDns('moteur.io', {
            resolver: fakeDns({ 'mail._domainkey.moteur.io': [`v=DKIM1; k=rsa; p=${p}`] })
        });
        expect(statusOf(same, 'dkim')).toBe('ok');
        const other = await checkDns('moteur.io', {
            resolver: fakeDns({ 'mail._domainkey.moteur.io': ['v=DKIM1; k=rsa; p=MIIBIjANBg'] })
        });
        expect(statusOf(other, 'dkim')).toBe('fail');
        const missing = await checkDns('moteur.io', { resolver: fakeDns({}) });
        expect(missing.find(c => c.id === 'dkim')!.message).toContain(`p=${p}`);
        const elsewhere = await checkDns('agence.example', { resolver: fakeDns({}) });
        expect(statusOf(elsewhere, 'dkim-alignment')).toBe('warn');
    });
});

describe('turning notification emails off', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-unsubscribe-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('JWT_SECRET', 'unsubscribe-test');
        vi.stubEnv('MOTEUR_API_URL', 'https://api.moteur.io/');
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                { id: 'u1', email: 'l@a.test', name: 'L', isActive: true, roles: [], projects: [] }
            ])
        );
        reloadUsers();
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('signs a link only the server can make', () => {
        const url = new URL(unsubscribeUrl('u1', 'reviews')!);
        expect(url.origin + url.pathname).toBe('https://api.moteur.io/auth/email/unsubscribe');
        const [u, t, s] = ['u', 't', 's'].map(k => url.searchParams.get(k)!);
        expect(checkUnsubscribe(u, t, s)).toBe(true);
        expect(checkUnsubscribe('u2', t, s)).toBe(false);
        expect(checkUnsubscribe(u, 'signin', s)).toBe(false);
        expect(checkUnsubscribe(u, t, s.slice(1))).toBe(false);
        vi.stubEnv('MOTEUR_API_URL', '');
        expect(unsubscribeUrl('u1', 'reviews')).toBeUndefined();
    });

    it('keeps the choice on the account, with look and language', async () => {
        expect(wantsEmail(getUserById('u1')!, 'reviews')).toBe(true);
        await setEmailTopic('u1', 'reviews', false);
        reloadUsers();
        expect(wantsEmail(getUserById('u1')!, 'reviews')).toBe(false);
        expect(await updatePreferences('u1', { look: 'folio', locale: 'fr-CA' })).toEqual({
            look: 'folio',
            locale: 'fr-CA',
            emails: { reviews: false }
        });
        expect(await updatePreferences('u1', { look: null, emails: { reviews: true } })).toEqual({
            locale: 'fr-CA',
            emails: { reviews: true }
        });
        await expect(updatePreferences('u1', { look: 'ledger' })).rejects.toThrow(/look/);
        await expect(updatePreferences('u1', { emails: { signin: false } })).rejects.toThrow(
            /Unknown email topic/
        );
    });
});

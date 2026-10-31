import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderEmail } from '../../src/email/render.js';
import { EMAIL_KINDS, samples } from '../../src/email/templates.js';
import { DESIGNS, esc } from '../../src/email/layout.js';
import {
    accentProblem,
    resolveEmailSettings,
    saveEmailSettings,
    EMAIL_LOOKS
} from '../../src/email/settings.js';
import { contrast } from '../../src/email/colour.js';

const settings = resolveEmailSettings({});
const snap = (name: string) => path.join(import.meta.dirname, '__snapshots__', name);

describe('every email, rendered', () => {
    // What a person reads: the plain text of every email in both languages, and the HTML of every
    // email in both looks. Open the .html files in a browser to see them.
    for (const kind of EMAIL_KINDS) {
        for (const locale of ['en', 'fr'] as const) {
            it(`${kind} · ${locale} · text`, async () => {
                const email = renderEmail(kind, samples(locale)[kind], { locale, settings });
                await expect(`Subject: ${email.subject}\n\n${email.text}`).toMatchFileSnapshot(
                    snap(`${kind}.${locale}.txt`)
                );
            });
        }
        for (const look of EMAIL_LOOKS) {
            const locale = look === 'folio' ? 'en' : 'fr';
            it(`${kind} · ${look} · ${locale} · html`, async () => {
                const email = renderEmail(kind, samples(locale)[kind], {
                    locale,
                    forceLook: look,
                    settings
                });
                await expect(email.html).toMatchFileSnapshot(
                    snap(`${kind}.${look}.${locale}.html`)
                );
            });
        }
    }
});

describe('what every email holds to', () => {
    const all = EMAIL_KINDS.flatMap(kind =>
        DESIGNS.flatMap(design =>
            (['en', 'fr'] as const).map(locale => ({
                name: `${kind} · ${design.id} · ${locale}`,
                email: renderEmail(kind, samples(locale)[kind], {
                    locale,
                    forceLook: design.look,
                    design: design.id,
                    settings
                })
            }))
        )
    );

    it.each(all)('$name: small, self-contained, no tracking', ({ email }) => {
        const { html } = email;
        // Gmail clips messages over 102 KB; these stay far below.
        expect(Buffer.byteLength(html)).toBeLessThan(24 * 1024);
        expect(html).not.toMatch(/<script|<link|@import|@font-face|<img/i);
        expect(html).toContain('<meta name="color-scheme" content="light dark">');
        expect(html).toContain('@media (prefers-color-scheme:dark)');
        expect(html).toContain(`lang="${email.locale === 'fr' ? 'fr-CA' : 'en-CA'}"`);
        expect(html).toContain(esc(email.preheader));
        expect(html.indexOf('display:none')).toBeLessThan(html.indexOf('<table'));
        for (const [, href] of html.matchAll(/href="([^"]+)"/g))
            expect(href.replace(/&amp;/g, '&')).toMatch(/^https:\/\//);
    });

    it.each(all)('$name: the text part has every link, in reading order', ({ email }) => {
        const links = [...email.html.matchAll(/href="([^"]+)"/g)].map(m =>
            m[1].replace(/&amp;/g, '&')
        );
        for (const link of new Set(links)) expect(email.text).toContain(link);
        // A project's own words go as written; the engine's end with a line break.
        if (!email.kind.startsWith('form-')) expect(email.text.endsWith('\n')).toBe(true);
    });

    it.each(all)('$name: French spacing, curly apostrophes', ({ email }) => {
        const words = `${email.subject}\n${email.preheader}\n${email.text}`.replace(
            /https?:\/\/\S+/g,
            ''
        );
        expect(words).not.toContain("'");
        if (email.locale === 'fr') expect(words).not.toMatch(/ [:;?!]/);
        else expect(words).not.toContain(' ');
    });

    it('puts the code first in the subject, and never a link to unsubscribe from sign-in', () => {
        for (const locale of ['en', 'fr'] as const) {
            for (const kind of ['signin', 'signup', 'verify'] as const) {
                const email = renderEmail(kind, samples(locale)[kind], { locale, settings });
                expect(email.subject).toMatch(/^\d{6} /);
                expect(email.unsubscribe).toBeUndefined();
            }
        }
        const review = renderEmail('review', samples('en').review, { settings });
        expect(review.unsubscribe).toMatch(/^https:\/\//);
        expect(review.html).toContain('Stop review emails');
    });

    it('shows the code spaced, copied whole', () => {
        const email = renderEmail('signin', samples('en').signin, { settings });
        expect(email.html).toMatch(/>482<\/span><span[^>]*>913</);
        expect(email.text).toContain('    482 913');
    });

    it('escapes what people typed', () => {
        const email = renderEmail(
            'invite',
            { ...samples('en').invite, inviter: '<b>Mallory</b>', project: 'A & "B"' },
            { settings }
        );
        expect(email.html).not.toContain('<b>Mallory');
        expect(email.html).toContain('&lt;b&gt;Mallory&lt;/b&gt;');
        expect(email.html).toContain('A &amp; &quot;B&quot;');
    });

    it('a project’s own mail is headed by the project, without the operator’s footer', () => {
        const s = { ...settings, footer: 'Moteur Inc. · 1 rue Ste-Catherine, Montréal' };
        const notice = renderEmail('form-notice', samples('fr')['form-notice'], { settings: s });
        expect(notice.html).toContain('Journal de Montréal');
        expect(notice.html).not.toContain('Ste-Catherine');
        const signin = renderEmail('signin', samples('fr').signin, { settings: s });
        expect(signin.html).toContain('Ste-Catherine');
        expect(signin.text).toContain('Ste-Catherine');
    });
});

describe('the operator’s brand', () => {
    it('uses an accent that reads, and lightens it in the dark', () => {
        const email = renderEmail('signin', samples('en').signin, {
            forceLook: 'folio',
            settings: { ...settings, accent: '#7A1FA0' }
        });
        expect(email.html).toContain('background-color:#7A1FA0');
        const dark = email.html.match(/\.m-btn\{background-color:(#[0-9A-F]{6})/)?.[1];
        expect(dark).toBeDefined();
        expect(contrast(dark!, '#191D23')).toBeGreaterThanOrEqual(4.5);
    });

    it('refuses an accent white text can’t read on', () => {
        expect(accentProblem('#E1A730')).toMatch(/too light/);
        expect(accentProblem('teal')).toMatch(/colour like/);
        expect(accentProblem('#1F5FC4')).toBeNull();
    });

    it('names the product and shows a logo in its place', () => {
        const named = renderEmail('welcome', samples('en').welcome, {
            settings: { ...settings, productName: 'Atelier' }
        });
        expect(named.subject).toBe('Welcome to Atelier');
        const logo = renderEmail('welcome', samples('en').welcome, {
            settings: { ...settings, logoUrl: 'https://cdn.example.com/logo.png', logoWidth: 96 }
        });
        expect(logo.html).toContain('<img src="https://cdn.example.com/logo.png" width="96"');
    });

    it('follows the reader’s look only when the operator says so', () => {
        const fixed = renderEmail('signin', samples('en').signin, {
            look: 'folio',
            settings: { ...settings, look: 'discotheque' }
        });
        expect(fixed.look).toBe('discotheque');
        const theirs = renderEmail('signin', samples('en').signin, {
            look: 'folio',
            settings: { ...settings, look: 'recipient' }
        });
        expect(theirs.look).toBe('folio');
        const unknown = renderEmail('signin', samples('en').signin, {
            settings: { ...settings, look: 'recipient' }
        });
        expect(unknown.look).toBe('discotheque');
    });
});

describe('email settings', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-email-settings-'));
        vi.stubEnv('DATA_ROOT', root);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('fall back to SMTP_FROM, then to the product name', () => {
        vi.stubEnv('SMTP_FROM', '"Moteur Cloud" <signin@moteur.io>');
        expect(resolveEmailSettings()).toMatchObject({
            fromName: 'Moteur Cloud',
            fromAddress: 'signin@moteur.io',
            productName: 'Moteur',
            look: 'discotheque',
            locale: 'en'
        });
        vi.stubEnv('SMTP_FROM', 'signin@moteur.io');
        expect(resolveEmailSettings().fromName).toBe('Moteur');
    });

    it('are kept in the operator’s file, and cleared with null', () => {
        saveEmailSettings({ productName: 'Atelier', locale: 'fr', accent: '#1f5fc4' }, 'op');
        expect(resolveEmailSettings()).toMatchObject({
            productName: 'Atelier',
            fromName: 'Atelier',
            locale: 'fr',
            accent: '#1F5FC4'
        });
        saveEmailSettings({ productName: null }, 'op');
        expect(resolveEmailSettings().productName).toBe('Moteur');
        const file = JSON.parse(
            fs.readFileSync(path.join(root, 'data', 'operator', 'email.json'), 'utf8')
        );
        expect(file.updatedBy).toBe('op');
    });

    it('refuse what can’t be used, saying why', () => {
        expect(() => saveEmailSettings({ fromAddress: 'nope' }, 'op')).toThrow(/email address/);
        expect(() => saveEmailSettings({ logoUrl: 'http://x.test/a.png' }, 'op')).toThrow(/https/);
        expect(() => saveEmailSettings({ fromName: 'A <b>' }, 'op')).toThrow(/can’t hold/);
        expect(() => saveEmailSettings({ look: 'ledger' }, 'op')).toThrow(/look must be/);
        expect(() => saveEmailSettings({ smtpPass: 'x' }, 'op')).toThrow(/Unknown setting/);
        expect(() => saveEmailSettings({ logoFile: 'missing.png' }, 'op')).toThrow(/no file/);
    });

    it('send a logo file inside the email, never as a remote image', () => {
        const file = path.join(root, 'logo.png');
        fs.writeFileSync(file, Buffer.from('89504e470d0a1a0a', 'hex'));
        saveEmailSettings({ logoFile: 'logo.png' }, 'op');
        const email = renderEmail('signin', samples('en').signin);
        expect(email.html).toContain('src="cid:logo@moteur"');
        expect(email.attachments).toHaveLength(1);
        expect(email.attachments[0]).toMatchObject({
            cid: 'logo@moteur',
            contentType: 'image/png'
        });
        const preview = renderEmail('signin', samples('en').signin, { images: 'data' });
        expect(preview.html).toContain('src="data:image/png;base64,');
        // A project's own mail never carries the operator's logo.
        expect(renderEmail('form-message', samples('en')['form-message']).attachments).toEqual([]);
    });
});

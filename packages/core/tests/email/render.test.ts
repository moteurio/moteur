import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderEmail } from '../../src/email/render.js';
import {
    EMAIL_KINDS,
    EMAIL_VARIANTS,
    VARIANT_KINDS,
    CONFIRM_ROWS,
    samples,
    type EmailData,
    type EmailKind,
    type EmailVariant
} from '../../src/email/templates.js';
import { DESIGNS, esc, initials } from '../../src/email/layout.js';
import { cleanInviteNote } from '../../src/invites.js';
import {
    accentProblem,
    resolveEmailSettings,
    saveEmailSettings,
    EMAIL_LOOKS
} from '../../src/email/settings.js';
import { contrast } from '../../src/email/colour.js';

const settings = resolveEmailSettings({});
const snap = (name: string) => path.join(import.meta.dirname, '__snapshots__', name);

/** Every email to look at: each kind, each way of setting the first-contact ones, and a welcome after an invitation. */
type Case = {
    name: string;
    kind: EmailKind;
    variant?: EmailVariant;
    data: (l: 'en' | 'fr') => unknown;
};
const joined = (l: 'en' | 'fr'): EmailData['welcome'] => ({
    ...samples(l).welcome,
    name: 'Marc',
    email: 'marc@client.example',
    joined: {
        project: 'Journal de Montréal',
        projectId: 'journal',
        description: samples(l).invite.projectDescription,
        inviter: 'Louise Tremblay',
        roles: ['writer']
    }
});
const CASES: Case[] = [
    ...EMAIL_KINDS.flatMap(kind =>
        (VARIANT_KINDS.includes(kind) ? EMAIL_VARIANTS : [undefined]).map(variant => ({
            name: variant && variant !== 'a' ? `${kind}.${variant}` : kind,
            kind,
            variant,
            data: (l: 'en' | 'fr') => samples(l)[kind]
        }))
    ),
    ...EMAIL_VARIANTS.map(variant => ({
        name: variant === 'a' ? 'welcome-joined' : `welcome-joined.${variant}`,
        kind: 'welcome' as const,
        variant,
        data: joined
    }))
];
const render = (c: Case, locale: 'en' | 'fr', options: Parameters<typeof renderEmail>[2] = {}) =>
    renderEmail(c.kind, c.data(locale) as never, {
        locale,
        settings,
        variant: c.variant,
        ...options
    });

describe('every email, rendered', () => {
    // What a person reads: the plain text of every email in both languages, and the HTML of every
    // email in both looks. Open the .html files in a browser to see them.
    for (const c of CASES) {
        for (const locale of ['en', 'fr'] as const) {
            it(`${c.name} · ${locale} · text`, async () => {
                const email = render(c, locale);
                await expect(`Subject: ${email.subject}\n\n${email.text}`).toMatchFileSnapshot(
                    snap(`${c.name}.${locale}.txt`)
                );
            });
        }
        for (const look of EMAIL_LOOKS) {
            const locale = look === 'folio' ? 'en' : 'fr';
            it(`${c.name} · ${look} · ${locale} · html`, async () => {
                const email = render(c, locale, { forceLook: look });
                await expect(email.html).toMatchFileSnapshot(
                    snap(`${c.name}.${look}.${locale}.html`)
                );
            });
        }
    }
});

describe('what every email holds to', () => {
    const all = CASES.flatMap(c =>
        DESIGNS.flatMap(design =>
            (['en', 'fr'] as const).map(locale => ({
                name: `${c.name} · ${design.id} · ${locale}`,
                email: render(c, locale, { forceLook: design.look })
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

    it('ships one design per look: Marquee and Tab', () => {
        expect(DESIGNS.map(d => d.id)).toEqual(['disco-marquee', 'folio-tab']);
        const disco = renderEmail('signin', samples('en').signin, {
            settings,
            forceLook: 'discotheque'
        });
        expect(disco.design).toBe('disco-marquee');
        expect(disco.html).toContain('class="m-band"');
        const folio = renderEmail('signin', samples('en').signin, { settings, forceLook: 'folio' });
        expect(folio.design).toBe('folio-tab');
        expect(folio.html).toContain('class="m-top"');
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

describe('first contact', () => {
    it('an invitation says who asked, to what, as what, and until when', () => {
        for (const variant of EMAIL_VARIANTS) {
            const email = renderEmail('invite', samples('en').invite, { settings, variant });
            expect(email.variant).toBe(variant);
            for (const words of [
                'Louise Tremblay',
                'louise@agence.example',
                'Journal de Montréal',
                'The neighbourhood paper’s website',
                'https://journal.example.com',
                'Writer',
                'write and edit entries and pages',
                'The Festival section is yours.',
                'What is Moteur?',
                'Moteur is where teams write'
            ])
                expect(email.text).toContain(words);
            expect(email.text).toMatch(/Sat, Nov\.? 7/);
            // The initials, never a picture.
            expect(email.html).toContain('>LT</td>');
            expect(email.html).not.toMatch(/<img/);
        }
        const fr = renderEmail('invite', samples('fr').invite, { settings, locale: 'fr' });
        expect(fr.text).toContain('Auteur·e');
        expect(fr.text).toContain('Un mot de Louise');
    });

    it('an invitation without a note, description or site still reads whole', () => {
        const { note: _n, projectDescription: _d, projectSite: _s, ...bare } = samples('en').invite;
        for (const variant of EMAIL_VARIANTS) {
            const email = renderEmail('invite', { ...bare, roles: [] }, { settings, variant });
            expect(email.text).not.toContain('A note from');
            expect(email.text).toContain('Writer');
            expect(email.text).toContain('Join Journal de Montréal');
        }
    });

    it('says what the widest role lets them do', () => {
        const email = renderEmail(
            'invite',
            { ...samples('en').invite, roles: ['writer', 'admin'] },
            { settings }
        );
        expect(email.text).toContain('Writer · Admin');
        expect(email.text).toContain('run the project');
    });

    it('keeps the inviter’s note as plain text', () => {
        const email = renderEmail(
            'invite',
            {
                ...samples('en').invite,
                note: '<a href="https://evil.example">Click</a>\nSecond line'
            },
            { settings, variant: 'b' }
        );
        expect(email.html).not.toContain('<a href="https://evil.example"');
        expect(email.html).toContain(
            '&lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt;<br>Second line'
        );
        expect(email.text).toContain('> Second line');
    });

    it('cleans an inviter’s note, and refuses one too long', () => {
        expect(cleanInviteNote('  Hi\r\n\r\n\r\n\r\nthere\u0007 ‮ ')).toBe('Hi\n\nthere');
        expect(cleanInviteNote('   ')).toBeUndefined();
        expect(cleanInviteNote(undefined)).toBeUndefined();
        expect(() => cleanInviteNote('x'.repeat(501))).toThrow(/longer than 500/);
        expect(() => cleanInviteNote(42)).toThrow(/text/);
    });

    it('a welcome after an invitation leads with the project', () => {
        for (const variant of EMAIL_VARIANTS) {
            const email = render(
                CASES.find(c => c.name === 'welcome-joined')!,
                'en',
                { variant }
            );
            expect(email.subject).toBe('Welcome to Journal de Montréal');
            expect(email.text).toContain('https://studio.example.com/projects/journal');
            expect(email.text).toContain('Louise Tremblay');
            expect(email.text).not.toContain('/projects/new');
        }
        const alone = renderEmail('welcome', samples('en').welcome, { settings });
        expect(alone.subject).toBe('Welcome to Moteur');
        expect(alone.text).toContain('/projects/new');
        expect(alone.text).toContain('no password to remember');
    });

    it('a welcome says how to sign in, and where help is', () => {
        const withPassword = renderEmail(
            'welcome',
            { ...samples('en').welcome, password: true },
            { settings: { ...settings, supportUrl: 'https://help.example.com/' } }
        );
        expect(withPassword.text).toContain('with your password, or ask for a code');
        expect(withPassword.text).toContain('Questions? Start here: https://help.example.com/');
        const nameless = renderEmail('welcome', { email: 'x@y.example' }, { settings });
        expect(nameless.text.split('\n')[0]).toBe('Welcome to Moteur');
    });

    it('the sign-up code says what the product is', () => {
        const email = renderEmail('signup', samples('fr').signup, { settings, locale: 'fr' });
        expect(email.text).toContain('Qu’est-ce que Moteur ?');
    });

    it('uses the operator’s tagline, per language', () => {
        const s = {
            ...settings,
            productName: 'Atelier',
            productTagline: { en: 'Atelier hosts our sites.' }
        };
        expect(renderEmail('signup', samples('en').signup, { settings: s }).text).toContain(
            'Atelier hosts our sites.'
        );
        // No French line: the default one, with the operator's name.
        expect(
            renderEmail('signup', samples('fr').signup, { settings: s, locale: 'fr' }).text
        ).toContain('Atelier est l’endroit');
    });

    it('a form’s confirmation shows the visitor what they sent, short, under the project only', () => {
        const long = 'word '.repeat(200);
        const rows = [
            ...samples('en')['form-confirm'].rows,
            { label: 'Note', value: `<img src=x onerror=alert(1)> ${long}` },
            ...Array.from({ length: 5 }, (_, i) => ({ label: `Extra ${i}`, value: 'x' }))
        ];
        const s = {
            ...settings,
            footer: 'Moteur Inc. · 1 rue Ste-Catherine',
            supportUrl: 'https://help.moteur.example',
            logoUrl: 'https://cdn.example.com/logo.png'
        };
        for (const variant of EMAIL_VARIANTS) {
            const email = renderEmail(
                'form-confirm',
                { ...samples('en')['form-confirm'], rows },
                { settings: s, variant }
            );
            // The project's words first.
            expect(
                email.text.startsWith('Got it, Marc.') || email.text.startsWith('Message received')
            ).toBe(true);
            expect(email.text.indexOf('Got it, Marc.')).toBeLessThan(
                email.text.indexOf('What you sent')
            );
            expect(email.html).not.toContain('<img');
            expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
            expect(email.text).not.toContain('word '.repeat(70));
            expect(email.text).toContain(`And ${rows.length - CONFIRM_ROWS} more answers.`);
            expect(email.text).toContain('the Contact form at https://journal.example.com');
            for (const operator of [
                'Ste-Catherine',
                'help.moteur.example',
                'cdn.example.com',
                'Moteur'
            ])
                expect(email.html).not.toContain(operator);
            expect(email.attachments).toEqual([]);
        }
    });
});

describe('initials', () => {
    it.each([
        ['Louise Tremblay', 'LT'],
        ['Élodie de la Fontaine', 'ÉF'],
        ['marc', 'M'],
        ['marc.gagnon@client.example', 'MG'],
        ['  ', '?'],
        ['(Louise)', 'L']
    ])('%s → %s', (name, out) => expect(initials(name)).toBe(out));
});

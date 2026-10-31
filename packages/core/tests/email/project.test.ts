import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEmailSettings, validateEmailSettings } from '../../src/email/settings.js';
import { canEditProjectEmail, fromAllowed, validateProjectEmail } from '../../src/projectEmail.js';

const settings = { ...resolveEmailSettings({}), sendingDomains: ['olimpico.example'] };

describe('a project’s email settings', () => {
    it('keep what can be used, tidied', () => {
        expect(
            validateProjectEmail(
                {
                    senderName: '  Café Olimpico ',
                    replyTo: 'Bonjour@Olimpico.example',
                    fromAddress: 'bonjour@olimpico.example',
                    accent: '#8a3b12',
                    footer: 'Café Olimpico\r\n124, rue Saint-Viateur O.\n\n\n\nMontréal',
                    siteUrl: 'https://olimpico.example',
                    logoWidth: 96.4,
                    logoUrl: null
                },
                settings
            )
        ).toEqual({
            senderName: 'Café Olimpico',
            replyTo: 'bonjour@olimpico.example',
            fromAddress: 'bonjour@olimpico.example',
            accent: '#8A3B12',
            footer: 'Café Olimpico\n124, rue Saint-Viateur O.\n\nMontréal',
            siteUrl: 'https://olimpico.example/',
            logoWidth: 96,
            logoUrl: null
        });
    });

    it('refuse what can’t be used, saying why', () => {
        const no = (patch: Record<string, unknown>, why: RegExp, s = settings) =>
            expect(() => validateProjectEmail(patch, s)).toThrow(why);
        no({ fromAddress: 'hi@elsewhere.example' }, /must be on olimpico\.example/);
        no({ fromAddress: 'hi@olimpico.example' }, /sends from its own address only/, {
            ...settings,
            sendingDomains: []
        });
        no({ accent: '#F5D76E' }, /too light/);
        no({ replyTo: 'nope' }, /email address/);
        no({ senderName: 'Olimpico <hi@x.example>' }, /can’t hold/);
        no({ siteUrl: 'http://olimpico.example' }, /https/);
        no({ logoWidth: 500 }, /24 to 300/);
        no({ footer: 'x'.repeat(401) }, /longer than 400/);
        no({ fromName: 'x' }, /Unknown setting/);
    });

    it('send from a project’s address only on an allowed domain', () => {
        expect(fromAllowed('a@olimpico.example', settings)).toBe(true);
        expect(fromAllowed('a@mail.olimpico.example', settings)).toBe(false);
    });
});

describe('who changes a project’s own mail', () => {
    it('admins, builders, developers and content leads; not writers, reviewers, translators or billing', () => {
        for (const role of ['admin', 'builder', 'developer', 'lead'])
            expect(canEditProjectEmail({ roles: [role] })).toBe(true);
        for (const role of ['writer', 'reviewer', 'translator', 'billing'])
            expect(canEditProjectEmail({ roles: [role] })).toBe(false);
    });
});

describe('the operator’s settings for projects’ mail', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('add “Sent with” when the host turns it on by default, unless the operator said no', () => {
        expect(resolveEmailSettings({}).projectCredit).toBe(false);
        vi.stubEnv('MOTEUR_EMAIL_PROJECT_CREDIT', '1');
        expect(resolveEmailSettings({}).projectCredit).toBe(true);
        expect(resolveEmailSettings({ projectCredit: false }).projectCredit).toBe(false);
    });

    it('take sending domains as a list or a line, and a “Sent with” switch', () => {
        expect(
            validateEmailSettings({
                sendingDomains: 'Olimpico.example, atelier-b.example.',
                projectCredit: 'on',
                defaultLook: 'folio'
            })
        ).toEqual({
            sendingDomains: ['olimpico.example', 'atelier-b.example'],
            projectCredit: true,
            defaultLook: 'folio'
        });
        expect(() => validateEmailSettings({ sendingDomains: ['not a domain'] })).toThrow(
            /not a domain/
        );
        expect(() => validateEmailSettings({ defaultLook: 'recipient' })).toThrow(/defaultLook/);
        expect(() => validateEmailSettings({ projectCredit: 'yes' })).toThrow(/true or false/);
    });
});

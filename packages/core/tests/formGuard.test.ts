import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('../src/webhooks/outboundHttp.js', () => ({ postWebhook: vi.fn() }));

import { postWebhook } from '../src/webhooks/outboundHttp.js';
import { createSubmission, purgeOldSpam, querySubmissions } from '../src/formSubmissions.js';
import { checkForm, createForm, getForm, updateForm } from '../src/forms.js';
import { formTokenAge, issueFormToken } from '../src/formGuard.js';
import { checkAnswers } from '../src/formAnswers.js';
import { localizeFields } from '../src/formText.js';
import type { FormField, FormSchema } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'guard-test-proj';
const user: User = {
    id: 'u1',
    name: 'Test User',
    isActive: true,
    email: 'u1@test.com',
    roles: [],
    projects: []
};
const meta = () => ({ submittedAt: new Date().toISOString() });

const fields: Record<string, FormField> = {
    name: {
        type: 'core/text',
        label: { en: 'Name', fr: 'Nom' },
        help: { en: 'As on your ID', fr: 'Comme sur vos papiers' },
        options: { required: true }
    },
    email: {
        type: 'core/email',
        label: { en: 'Email', fr: 'Courriel' },
        messages: {
            invalid: { en: 'We need an email to answer you', fr: 'Il nous faut un courriel' }
        }
    },
    topic: {
        type: 'core/select',
        label: 'Topic',
        options: {
            choices: [
                { value: 'sales', label: { en: 'Sales', fr: 'Ventes' } },
                { value: 'help', label: { en: 'Help', fr: 'Aide' } }
            ]
        }
    }
};

let projectDir: string;
const secretsFile = () => path.join(projectDir, '.moteur', 'secrets.json');
const formFile = (id: string) => path.join(projectDir, 'forms', id, 'form.json');

async function makeForm(id: string, extra: Partial<FormSchema> = {}) {
    return createForm(user, projectId, {
        id,
        label: 'Contact',
        fields,
        status: 'active',
        createdAt: '',
        updatedAt: '',
        ...extra
    } as FormSchema);
}

describe('forms in the visitor’s language', () => {
    it('words labels, hints and choices in one language (fr-CA reads fr)', () => {
        const fr = localizeFields(fields, 'fr-CA');
        expect(fr.name.label).toBe('Nom');
        expect(fr.name.help).toBe('Comme sur vos papiers');
        expect(fr.topic.options?.choices).toEqual([
            { value: 'sales', label: 'Ventes' },
            { value: 'help', label: 'Aide' }
        ]);
        expect(fr.email.messages).toEqual({ invalid: 'Il nous faut un courriel' });
        // A language nobody wrote: the first one written.
        expect(localizeFields(fields, 'de').name.label).toBe('Name');
    });

    it('words issues in the visitor’s language, or in the field’s own words', () => {
        const { issues } = checkAnswers({ fields }, { email: 'nope', topic: 'other' }, 'fr');
        expect(issues).toEqual([
            { field: 'name', code: 'required', message: 'est obligatoire' },
            { field: 'email', code: 'invalid', message: 'Il nous faut un courriel' },
            { field: 'topic', code: 'choice', message: 'doit être l’un des choix' }
        ]);
        const en = checkAnswers({ fields }, { name: 'x'.repeat(1001) }, 'en').issues;
        expect(en[0]).toEqual({
            field: 'name',
            code: 'too_long',
            message: 'must be at most 1000 characters'
        });
    });

    it('takes a choice by its value, whatever language its label is in', () => {
        const { data, issues } = checkAnswers({ fields }, { name: 'Lise', topic: 'help' });
        expect(issues).toEqual([]);
        expect(data.topic).toBe('help');
    });

    it('refuses a label that is neither a text nor one per language', () => {
        expect(() =>
            checkForm({ fields: { a: { type: 'core/text', label: { en: 3 } as never } } })
        ).toThrow('"label" must be a text');
    });
});

describe('form guard', () => {
    let tempDir: string;
    let originalDataRoot: string | undefined;

    beforeEach(async () => {
        vi.mocked(postWebhook).mockReset();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-guard-'));
        projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'Guard', defaultLocale: 'en', users: ['u1'] })
        );
        originalDataRoot = process.env.DATA_ROOT;
        process.env.DATA_ROOT = tempDir;
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('render token', () => {
        it('says how long ago the form was shown, for this form only', () => {
            const now = Date.now();
            const token = issueFormToken(projectId, 'contact', now - 8_000);
            expect(formTokenAge(projectId, 'contact', token, now)).toBe(8);
            expect(formTokenAge(projectId, 'other', token, now)).toBeUndefined();
            const [at, sig] = token.split('.');
            expect(formTokenAge(projectId, 'contact', `${Number(at) - 60_000}.${sig}`, now)).toBe(
                undefined
            );
            expect(formTokenAge(projectId, 'contact', token, now + 25 * 3600_000)).toBeUndefined();
        });

        it('signs with a key kept in the secrets file', async () => {
            issueFormToken(projectId, 'contact');
            const secrets = JSON.parse(await fs.readFile(secretsFile(), 'utf8'));
            expect(typeof secrets.forms.tokenKey).toBe('string');
        });
    });

    describe('time trap', () => {
        it('keeps an answer sent too soon as spam: no actions, not counted', async () => {
            await makeForm('contact');
            const token = issueFormToken(projectId, 'contact', Date.now() - 1_000);
            const sub = await createSubmission(projectId, 'contact', { name: 'Bot' }, meta(), {
                token
            });
            expect(sub.status).toBe('spam');
            expect(sub.spamAt).toBeDefined();
            expect(sub.metadata.spamReason).toBe('too_fast');
            expect(sub.actionResults).toEqual([]);
        });

        it('keeps an answer sent after the minimum, with how long it took', async () => {
            await makeForm('contact');
            const token = issueFormToken(projectId, 'contact', Date.now() - 20_000);
            const sub = await createSubmission(projectId, 'contact', { name: 'Lise' }, meta(), {
                token
            });
            expect(sub.status).toBe('received');
            expect(sub.metadata.fillSeconds).toBeGreaterThanOrEqual(20);
        });

        it('takes answers without a token, unless the form requires one', async () => {
            await makeForm('open');
            await makeForm('strict', { timeTrap: { required: true } });
            const open = await createSubmission(projectId, 'open', { name: 'Lise' }, meta(), {});
            const strict = await createSubmission(
                projectId,
                'strict',
                { name: 'Lise' },
                meta(),
                {}
            );
            expect(open.status).toBe('received');
            expect(strict.metadata.spamReason).toBe('no_token');
        });
    });

    describe('captcha', () => {
        const turnstile = {
            provider: 'turnstile',
            siteKey: '0x4AAA',
            secretKey: '0x4AAA-secret'
        } as never;
        const answer = (body: object) =>
            vi.mocked(postWebhook).mockResolvedValue({ status: 200, body: JSON.stringify(body) });

        it('keeps the secret in the secrets file, never in the form', async () => {
            await makeForm('contact', { captcha: turnstile });
            const stored = JSON.parse(await fs.readFile(formFile('contact'), 'utf8'));
            expect(stored.captcha).toEqual({ provider: 'turnstile', siteKey: '0x4AAA' });
            expect(await fs.readFile(secretsFile(), 'utf8')).not.toContain('{"provider"');
            const form = await getForm(user, projectId, 'contact');
            expect(form.captcha).toEqual({
                provider: 'turnstile',
                siteKey: '0x4AAA',
                secretSet: true
            });
            // Saving what the Studio shows keeps the secret.
            await updateForm(user, projectId, 'contact', { captcha: form.captcha });
            expect((await getForm(user, projectId, 'contact')).captcha?.secretSet).toBe(true);
        });

        it('moves an old reCAPTCHA secret out of the form when it is saved', async () => {
            await makeForm('old');
            const file = formFile('old');
            const stored = JSON.parse(await fs.readFile(file, 'utf8'));
            stored.recaptcha = { siteKey: '6Lc', secretKey: '6Lc-secret' };
            await fs.writeFile(file, JSON.stringify(stored));
            await updateForm(user, projectId, 'old', { label: 'Old' });
            expect(await fs.readFile(file, 'utf8')).not.toContain('6Lc-secret');
            expect((await getForm(user, projectId, 'old')).captcha).toEqual({
                provider: 'recaptcha',
                siteKey: '6Lc',
                secretSet: true
            });
        });

        it('asks the provider, with the secret and the visitor’s address', async () => {
            await makeForm('contact', { captcha: turnstile });
            answer({ success: true });
            const sub = await createSubmission(projectId, 'contact', { name: 'Lise' }, meta(), {
                captcha: 'XXXX.DUMMY',
                ip: '203.0.113.9'
            });
            expect(sub.status).toBe('received');
            const [url, , body] = vi.mocked(postWebhook).mock.calls[0];
            expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
            expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
                secret: '0x4AAA-secret',
                response: 'XXXX.DUMMY',
                remoteip: '203.0.113.9'
            });
        });

        it('asks to answer again when it wasn’t answered or was refused', async () => {
            await makeForm('contact', { captcha: turnstile });
            await expect(
                createSubmission(projectId, 'contact', { name: 'Lise' }, meta(), {})
            ).rejects.toMatchObject({ statusCode: 400, code: 'CAPTCHA_FAILED' });
            answer({ success: false, 'error-codes': ['invalid-input-response'] });
            await expect(
                createSubmission(
                    projectId,
                    'contact',
                    { name: 'Lise' },
                    { ...meta(), locale: 'fr' },
                    {
                        captcha: 'used'
                    }
                )
            ).rejects.toThrow('Confirmez que vous n’êtes pas un robot');
            expect((await querySubmissions(user, projectId, 'contact')).total).toBe(0);
        });

        it('checks answers before the captcha, so one answer isn’t spent on a typo', async () => {
            await makeForm('contact', { captcha: turnstile });
            await expect(
                createSubmission(projectId, 'contact', { email: 'nope' }, meta(), { captcha: 'a' })
            ).rejects.toMatchObject({ code: 'ANSWERS_INVALID' });
            expect(postWebhook).not.toHaveBeenCalled();
        });

        it('keeps a low reCAPTCHA score as spam', async () => {
            await makeForm('contact', {
                captcha: {
                    provider: 'recaptcha',
                    siteKey: '6L',
                    secretKey: 's',
                    minScore: 0.7
                } as never
            });
            answer({ success: true, score: 0.3 });
            const sub = await createSubmission(projectId, 'contact', { name: 'Lise' }, meta(), {
                captcha: 'r'
            });
            expect(sub.status).toBe('spam');
            expect(sub.metadata).toMatchObject({
                spamReason: 'captcha_score',
                recaptchaScore: 0.3
            });
        });

        it('keeps the answer, marked unchecked, when the provider can’t be reached', async () => {
            await makeForm('contact', { captcha: turnstile });
            vi.mocked(postWebhook).mockRejectedValue(new Error('timed out'));
            const sub = await createSubmission(projectId, 'contact', { name: 'Lise' }, meta(), {
                captcha: 'a'
            });
            expect(sub.status).toBe('received');
            expect(sub.metadata.captchaUnchecked).toBe(true);
        });
    });

    describe('inbox index and spam', () => {
        it('pages from the index, and rebuilds it when a file goes', async () => {
            await makeForm('contact');
            for (let i = 0; i < 5; i++)
                await createSubmission(
                    projectId,
                    'contact',
                    { name: `P${i}` },
                    { submittedAt: `2026-10-0${i + 1}T10:00:00.000Z` }
                );
            const page = await querySubmissions(user, projectId, 'contact', {
                offset: 1,
                limit: 2
            });
            expect(page.total).toBe(5);
            expect(page.unread).toBe(5);
            expect(page.submissions.map(s => s.data.name)).toEqual(['P3', 'P2']);

            const dir = path.join(projectDir, 'user-data', 'forms', 'contact');
            const index = JSON.parse(await fs.readFile(path.join(dir, '_index.json'), 'utf8'));
            expect(index.rows).toHaveLength(5);
            await fs.rm(path.join(dir, `${page.submissions[0].id}.json`));
            expect((await querySubmissions(user, projectId, 'contact')).total).toBe(4);
        });

        it('deletes spam 30 days after it arrived, and nothing else', async () => {
            await makeForm('contact');
            const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
            await createSubmission(projectId, 'contact', { name: 'Old' }, { submittedAt: old });
            const bot = await createSubmission(
                projectId,
                'contact',
                { name: 'Bot' },
                { submittedAt: old },
                { honeypotTriggered: true }
            );
            await createSubmission(projectId, 'contact', { name: 'New bot' }, meta(), {
                honeypotTriggered: true
            });
            // Made spam a month ago.
            const dir = path.join(projectDir, 'user-data', 'forms', 'contact');
            const file = path.join(dir, `${bot.id}.json`);
            const stored = JSON.parse(await fs.readFile(file, 'utf8'));
            await fs.writeFile(file, JSON.stringify({ ...stored, spamAt: old }));
            await fs.rm(path.join(dir, '_index.json'), { force: true });

            expect(await purgeOldSpam(projectId, 'contact')).toBe(1);
            const left = await querySubmissions(user, projectId, 'contact');
            expect(left.submissions.map(s => s.data.name).sort()).toEqual(['New bot', 'Old']);
        });
    });
});

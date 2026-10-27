import { describe, expect, it } from 'vitest';
import type { Field } from '@moteurio/types/Field.js';
import { answersMessage, checkAnswers } from '../src/formAnswers.js';

// The demo journal's forms, merged: what a visitor can send from a contact or adoption page.
const form = {
    fields: {
        name: { type: 'core/text', label: { fr: 'Nom', en: 'Name' }, options: { required: true } },
        email: { type: 'core/email', label: 'Email', options: { required: true } },
        household: { type: 'core/number', label: 'Household', options: { min: 1, max: 20 } },
        subject: {
            type: 'core/select',
            label: 'Subject',
            options: { choices: ['courrier', 'presse', { value: 'autre', label: 'Autre' }] }
        },
        topics: {
            type: 'core/multi-select',
            label: 'Topics',
            options: { choices: ['robots', 'usines'] }
        },
        message: { type: 'core/textarea', label: 'Message', options: { maxLength: 20 } },
        owner: { type: 'core/boolean', label: 'Owner' },
        consent: { type: 'core/boolean', label: 'Consent', options: { required: true } },
        visit: { type: 'core/date', label: 'Visit' },
        site: { type: 'core/url', label: 'Website' }
    } as unknown as Record<string, Field>
};

const valid = {
    name: '  Céleste ',
    email: 'celeste@journal.test',
    household: '3',
    subject: 'autre',
    topics: ['robots', 'usines'],
    message: 'Bonjour',
    consent: 'on',
    visit: '1968-03-02',
    site: 'https://journal.test'
};

describe('form answers, checked by the server', () => {
    it('keeps the form’s fields only, as numbers, yes-or-no and trimmed text', () => {
        const { data, issues } = checkAnswers(form, { ...valid, _token: 'x', role: 'admin' });
        expect(issues).toEqual([]);
        expect(data).toEqual({
            name: 'Céleste',
            email: 'celeste@journal.test',
            household: 3,
            subject: 'autre',
            topics: ['robots', 'usines'],
            message: 'Bonjour',
            owner: false,
            consent: true,
            visit: '1968-03-02',
            site: 'https://journal.test'
        });
    });

    it('lists every answer to fix, whatever the browser let through', () => {
        const { issues } = checkAnswers(form, {
            email: 'not-an-email',
            household: '99',
            subject: 'secret',
            topics: ['robots', 'admin'],
            message: 'x'.repeat(21),
            owner: 'maybe',
            consent: 'off',
            visit: '1968-02-31x',
            site: 'javascript:alert(1)'
        });
        expect(issues.map(i => [i.field, i.code])).toEqual([
            ['name', 'required'],
            ['email', 'invalid'],
            ['household', 'too_large'],
            ['subject', 'choice'],
            ['topics', 'choice'],
            ['message', 'too_long'],
            ['owner', 'invalid'],
            ['consent', 'required'],
            ['visit', 'invalid'],
            ['site', 'invalid']
        ]);
    });

    it('refuses objects and lists where one answer is expected, and caps text', () => {
        const { issues } = checkAnswers(form, {
            ...valid,
            name: { $gt: '' },
            email: ['a@b.co', 'c@d.co'],
            subject: ['courrier', 'presse']
        });
        expect(issues.map(i => [i.field, i.code])).toEqual([
            ['name', 'invalid'],
            ['email', 'invalid'],
            ['subject', 'choice']
        ]);
        const long = checkAnswers(
            { fields: { note: { type: 'core/text', label: 'Note' } } },
            { note: 'x'.repeat(1001) }
        );
        expect(long.issues[0]).toMatchObject({ code: 'too_long' });
    });

    it('takes any short answers on a form that declares no fields', () => {
        const { data } = checkAnswers(
            { fields: {} },
            { a: ' 1 ', b: { nested: true }, 'bad key!': 'x', c: '' }
        );
        expect(data).toEqual({ a: '1' });
    });

    it('names the fields to fix in the visitor’s language', () => {
        const { issues } = checkAnswers(form, { ...valid, name: '', email: 'x' });
        expect(answersMessage(form, issues, 'fr')).toBe('Vérifiez ces réponses\u202f: Nom, Email.');
        expect(answersMessage(form, issues.slice(0, 1), 'en')).toBe(
            'Please check this answer: Name.'
        );
    });
});

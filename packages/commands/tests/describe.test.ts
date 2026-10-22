import { describe, it, expect } from 'vitest';
import { describeField, describeProject } from '../src/describe.js';

describe('describing a project', () => {
    it('puts each field in a line', () => {
        expect(
            describeField({
                type: 'core/text',
                options: { multilingual: true, required: true, maxLength: 140 }
            })
        ).toBe('text, per language, required, max 140 characters');
        expect(describeField({ type: 'core/relation', options: { model: 'author' } })).toBe(
            'entry id → author'
        );
        expect(
            describeField({
                type: 'core/select',
                description: { en: 'Who wrote it' },
                options: { choices: [{ value: 'human' }, { value: 'robot' }] }
            })
        ).toBe('select, one of human, robot: Who wrote it');
    });

    it('says how content goes live, and the person’s roles in this project', () => {
        const d = describeProject(
            {
                id: 'demo',
                label: { fr: 'Journal' },
                defaultLocale: 'fr',
                supportedLocales: ['fr', 'en'],
                workflow: { enabled: true, requireReview: true },
                memberRoles: { louise: ['writer'] }
            },
            [{ id: 'article', fields: { title: { type: 'core/text' } } }],
            { id: 'louise', name: 'Louise', roles: ['admin'] }
        );
        expect(d.languages.all).toEqual(['fr', 'en']);
        expect(d.goingLive).toMatch(/after a reviewer approves/);
        expect(d.you.roles).toEqual(['writer']);
        expect(d.models[0].fields).toEqual({ title: 'text' });
    });
});

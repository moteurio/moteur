import { describe, expect, it } from 'vitest';
import {
    canManageBilling,
    canReview,
    canTranslate,
    canWrite,
    creatorRoles,
    hasRole,
    inProject,
    normalizeStoredRoles,
    rolesInProject,
    translatorOnly
} from '@moteurio/types';
import { translationOnlyChange } from '../src/contentAccess.js';

const user = (roles: string[]) => ({ roles });

describe('roles', () => {
    it('treats an empty list as a writer and nothing else', () => {
        expect(canWrite(user([]))).toBe(true);
        expect(hasRole(user([]), 'admin')).toBe(false);
        expect(translatorOnly(user([]))).toBe(false);
        expect(normalizeStoredRoles([])).toEqual(['writer']);
    });

    it('lets developer act as admin and writer, and reviewer act as writer', () => {
        expect(hasRole(user(['developer']), 'admin')).toBe(true);
        expect(canWrite(user(['developer']))).toBe(true);
        expect(canReview(user(['developer']))).toBe(true);
        expect(hasRole(user(['developer']), 'developer')).toBe(true);
        expect(canWrite(user(['reviewer']))).toBe(true);
        expect(canReview(user(['admin']))).toBe(true);
        expect(hasRole(user(['admin']), 'developer')).toBe(false);
    });

    it('keeps translator and billing from writing unless a wider role is stored', () => {
        expect(translatorOnly(user(['translator']))).toBe(true);
        expect(canWrite(user(['translator']))).toBe(false);
        expect(canTranslate(user(['translator']))).toBe(true);
        expect(translatorOnly(user(['translator', 'writer']))).toBe(false);
        expect(canManageBilling(user(['billing']))).toBe(true);
        expect(canWrite(user(['billing']))).toBe(false);
        expect(canManageBilling(user(['admin']))).toBe(false);
    });
});

describe('project roles', () => {
    const ada = { id: 'ada', roles: ['writer'] };
    const project = { memberRoles: { ada: ['admin', 'billing'] } };

    it('uses the roles set on the project, else the account roles', () => {
        expect(rolesInProject(ada, project)).toEqual(['admin', 'billing']);
        expect(rolesInProject({ id: 'grace', roles: ['reviewer'] }, project)).toEqual(['reviewer']);
        expect(hasRole(inProject(ada, project), 'admin')).toBe(true);
        expect(hasRole(ada, 'admin')).toBe(false);
        expect(inProject(ada, {})).toBe(ada);
    });

    it('gives a creator admin, billing and developer on top of their Studio roles, dropping unknown ones', () => {
        expect(creatorRoles({ roles: ['user'] })).toEqual(['admin', 'billing', 'developer']);
        expect(creatorRoles({ roles: ['developer', 'admin'] })).toEqual([
            'developer',
            'admin',
            'billing'
        ]);
    });
});

describe('translationOnlyChange', () => {
    const locales = ['fr', 'en'];

    it('allows another language, including inside a block, and refuses the source', () => {
        const before = {
            title: { fr: 'Bonjour', en: 'Hello' },
            body: [{ type: 'core/paragraph', data: { text: { fr: 'Ici', en: '' } } }]
        };
        const translated = {
            title: { fr: 'Bonjour', en: 'Good day' },
            body: [{ type: 'core/paragraph', data: { text: { fr: 'Ici', en: 'Here' } } }]
        };
        expect(translationOnlyChange(before, translated, locales, 'fr')).toBe(true);
        const source = { ...before, title: { fr: 'Salut', en: 'Hello' } };
        expect(translationOnlyChange(before, source, locales, 'fr')).toBe(false);
    });

    it('refuses a new block, a relation, and a plain field', () => {
        expect(
            translationOnlyChange(
                { author: { id: 'ada' } },
                { author: { id: 'grace' } },
                locales,
                'fr'
            )
        ).toBe(false);
        expect(translationOnlyChange({ tags: ['a'] }, { tags: ['a', 'b'] }, locales, 'fr')).toBe(
            false
        );
        expect(translationOnlyChange({ slug: 'bonjour' }, { slug: 'hello' }, locales, 'fr')).toBe(
            false
        );
    });
});

import { describe, expect, it } from 'vitest';
import { validateModel } from '../../src/validators/validateModel.js';
import { validateTemplate } from '../../src/validators/validateTemplate.js';
import { validateStructure } from '../../src/validators/validateStructure.js';
import { isLabel, labelText } from '../../src/utils/validation.js';

const labelIssues = (r: { issues: { path?: string; type: string }[] }) =>
    r.issues.filter(i => i.path === 'label' && i.type === 'error');

describe('labels in every language', () => {
    it('accepts one name, or one per language', () => {
        expect(isLabel('Article')).toBe(true);
        expect(isLabel({ en: 'Article', fr: 'Article' })).toBe(true);
        expect(isLabel({ en: '', fr: 'Personne' })).toBe(true);
    });
    it('refuses nothing, blanks and non-text', () => {
        for (const bad of [undefined, '', '  ', {}, { en: '' }, { en: 3 }, ['a']])
            expect(isLabel(bad)).toBe(false);
    });
    it('lets models, templates and structures have them', () => {
        const label = { en: 'Person', fr: 'Personne' };
        expect(labelIssues(validateModel({ id: 'person', label, fields: {} } as never))).toEqual(
            []
        );
        expect(labelIssues(validateTemplate({ id: 'person', label, fields: {} } as never))).toEqual(
            []
        );
        expect(
            labelIssues(validateStructure({ type: 'person', label, fields: {} } as never))
        ).toEqual([]);
        expect(
            labelIssues(validateModel({ id: 'person', label: 3, fields: {} } as never))
        ).toHaveLength(1);
    });
    it('reads one text from a label', () => {
        expect(labelText({ en: 'Person', fr: 'Personne' }, 'x')).toBe('Person');
        expect(labelText(undefined, 'x')).toBe('x');
    });
});

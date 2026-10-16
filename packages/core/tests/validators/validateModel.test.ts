import { describe, it, expect } from 'vitest';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { checkStudioForm } from '@moteurio/types/StudioForm.js';
import { validateModel } from '../../src/validators/validateModel.js';

const fields = {
    title: { type: 'core/text', label: 'Title' },
    kind: { type: 'core/select', label: 'Kind' },
    body: { type: 'core/rich-text', label: 'Body' },
    slug: { type: 'core/slug', label: 'Slug' }
};

const model = (studio?: ModelSchema['studio']): ModelSchema => ({
    id: 'article',
    label: 'Article',
    fields,
    ...(studio ? { studio } : {})
});

describe('validateModel · studio form', () => {
    it('accepts a model without a form, and a good form', () => {
        expect(validateModel(model()).issues).toEqual([]);
        const result = validateModel(
            model({
                form: {
                    sections: [
                        {
                            id: 'story',
                            kind: 'canvas',
                            fields: [{ field: 'title', as: 'headline' }, 'body']
                        },
                        { id: 'facts', kind: 'card', place: 'side', rows: [['kind', 'slug']] }
                    ]
                }
            })
        );
        expect(result.issues).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('warns about form mistakes without blocking the save', () => {
        const result = validateModel(
            model({
                form: {
                    sections: [
                        {
                            id: 'story',
                            kind: 'canvas',
                            fields: ['gone', { field: 'body', as: 'headline' }, 'title']
                        },
                        { id: 'story', kind: 'tabs' as never, fields: ['title'] }
                    ]
                }
            })
        );
        expect(result.valid).toBe(true);
        expect(result.issues.every(i => i.type === 'warning')).toBe(true);
        expect(result.issues.map(i => i.path)).toEqual([
            'studio.form.sections[0].fields[0]',
            'studio.form.sections[0].fields[1].as',
            'studio.form.sections[1].id',
            'studio.form.sections[1].kind',
            'studio.form.sections[1].fields[0]'
        ]);
    });
});

describe('checkStudioForm', () => {
    it('checks rows, "when" and the form shape', () => {
        expect(checkStudioForm(null, fields)[0].path).toBe('form');
        expect(checkStudioForm({ sections: {} }, fields)[0].path).toBe('form.sections');
        const problems = checkStudioForm(
            {
                sections: [
                    {
                        id: 'a',
                        kind: 'sheet',
                        rows: [['title', 'kind', 'body', 'slug']],
                        fields: []
                    },
                    {
                        id: 'b',
                        kind: 'card',
                        fields: [{ field: 'nope' }, { field: 'x', when: { missing: ['y'] } }]
                    }
                ]
            },
            fields
        );
        expect(problems.map(p => p.path)).toEqual([
            'form.sections[0]',
            'form.sections[0].rows[0]',
            'form.sections[1].fields[0]',
            'form.sections[1].fields[1]'
        ]);
    });

    it('flags a "when" on a missing field', () => {
        const problems = checkStudioForm(
            {
                sections: [
                    {
                        id: 'a',
                        kind: 'card',
                        fields: [{ field: 'title', when: { missing: ['x'] } }]
                    }
                ]
            },
            fields
        );
        expect(problems).toEqual([
            {
                path: 'form.sections[0].fields[0].when',
                message: '"when" names a missing field "missing".'
            }
        ]);
    });
});

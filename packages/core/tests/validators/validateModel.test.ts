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

describe('validateModel · studio list', () => {
    const withImage = {
        ...fields,
        cover: { type: 'core/image', label: 'Cover' },
        author: { type: 'core/relation', label: 'Author', options: { model: 'author' } }
    };
    const listModel = (list: unknown): ModelSchema =>
        ({ id: 'article', label: 'Article', fields: withImage, studio: { list } }) as ModelSchema;

    it('accepts good list settings', () => {
        const result = validateModel(
            listModel({
                views: ['list', 'cards', 'split'],
                defaultView: 'cards',
                thumbnail: 'cover',
                subtitle: ['kind', 'author'],
                columns: ['author', 'kind'],
                filters: ['author', 'kind'],
                sort: 'title',
                groupBy: 'author'
            })
        );
        expect(result.issues).toEqual([]);
        expect(validateModel(listModel({ thumbnail: false, groupBy: '$workflow' })).issues).toEqual(
            []
        );
    });

    it('warns about list mistakes without blocking the save', () => {
        const result = validateModel(
            listModel({
                views: ['list', 'table'],
                defaultView: 'board',
                thumbnail: 'title',
                columns: ['author', 'gone'],
                sort: 'random',
                groupBy: 'body'
            })
        );
        expect(result.valid).toBe(true);
        expect(
            result.issues.every(i => i.type === 'warning' && i.code === 'MODEL_STUDIO_LIST')
        ).toBe(true);
        expect(result.issues.map(i => i.path)).toEqual([
            'studio.list.views[1]',
            'studio.list.defaultView',
            'studio.list.thumbnail',
            'studio.list.columns[1]',
            'studio.list.sort',
            'studio.list.groupBy'
        ]);
    });
});

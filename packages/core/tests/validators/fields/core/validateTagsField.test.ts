import { describe, it, expect } from 'vitest';
import { validateTagsField } from '../../../../src/validators/fields/core/validateTagsField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateTagsField', () => {
    const field: Field = {
        type: 'core/tags',
        label: 'Tags',
        options: {
            maxTags: 3,
            source: 'project/tags'
        }
    };

    it('validates an array of strings within maxTags', () => {
        const tags = ['tag1', 'tag2'];
        const issues = validateTagsField(tags, field, 'data.tags');
        expect(issues).toEqual([]);
    });

    it('errors if tags array exceeds maxTags', () => {
        const tags = ['tag1', 'tag2', 'tag3', 'tag4'];
        const issues = validateTagsField(tags, field, 'data.tags');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'TAGS_TOO_MANY'
                })
            ])
        );
    });

    it('errors if value is not an array', () => {
        const tags = 'not-an-array';
        const issues = validateTagsField(tags, field, 'data.tags');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'TAGS_INVALID_TYPE'
                })
            ])
        );
    });

    it('errors if a tag is not a string', () => {
        const tags = ['tag1', 123, 'tag3'];
        const issues = validateTagsField(tags, field, 'data.tags');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'TAG_INVALID_TYPE'
                })
            ])
        );
    });

    it('errors if source is missing', () => {
        const fieldMissingSource: Field = {
            ...field,
            options: { maxTags: 3 } // no source
        };
        const tags = ['tag1', 'tag2'];
        const issues = validateTagsField(tags, fieldMissingSource, 'data.tags');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'error',
                    code: 'TAGS_MISSING_SOURCE'
                })
            ])
        );
    });
});

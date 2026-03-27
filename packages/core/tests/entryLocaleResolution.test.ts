import { describe, it, expect } from 'vitest';
import type { Entry } from '@moteurio/types/Model.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { Field } from '@moteurio/types/Field.js';
import { resolveEntryDataForLocale } from '../src/entryLocaleResolution.js';

const titleField: Field = {
    type: 'core/text',
    label: 'Title',
    options: { multilingual: true }
};

const slugField: Field = {
    type: 'core/slug',
    label: 'Slug',
    options: { multilingual: false }
};

const model: ModelSchema = {
    id: 'article',
    label: 'Article',
    fields: {
        title: titleField,
        slug: slugField
    }
};

describe('resolveEntryDataForLocale', () => {
    it('resolves multilingual text to the requested locale string', () => {
        const entry: Entry = {
            id: 'e1',
            type: 'article',
            data: {
                title: { en: 'Hello', fr: 'Bonjour' },
                slug: 'hello'
            }
        };
        const out = resolveEntryDataForLocale(entry, model, 'fr', 'en', 'p1', {});
        expect(out.data.title).toBe('Bonjour');
        expect(out.data.slug).toBe('hello');
    });

    it('falls back to default locale when target locale missing', () => {
        const entry: Entry = {
            id: 'e1',
            type: 'article',
            data: {
                title: { en: 'Hello' },
                slug: 'hello'
            }
        };
        const out = resolveEntryDataForLocale(entry, model, 'fr', 'en', 'p1', {});
        expect(out.data.title).toBe('Hello');
    });
});

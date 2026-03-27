import { describe, it, expect } from 'vitest';
import { validateEntry } from '../../src/validators/validateEntry.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { ModelSchema } from '@moteurio/types/Model.js';

// Load field registry so slug/tags/table validators can resolve field schemas
import '../../src/fields/index.js';

describe('validateEntry', () => {
    const schema: ModelSchema = {
        id: 'core/article',
        label: 'Article',
        fields: {
            title: {
                type: 'core/text',
                label: 'Title',
                options: { required: true }
            },
            email: {
                type: 'core/email',
                label: 'Email',
                options: { required: false }
            },
            tags: {
                type: 'core/multi-select',
                label: 'Tags',
                options: { allowEmpty: true }
            }
        }
    } as ModelSchema;

    it('returns valid when required fields are present and valid', async () => {
        const entry: Entry = {
            id: 'e1',
            type: 'core/article',
            data: {
                title: 'Hello',
                email: 'user@example.com',
                tags: ['a', 'b']
            }
        };
        const result = await validateEntry('p1', entry, schema);
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it('returns invalid when required field is missing', async () => {
        const entry: Entry = {
            id: 'e1',
            type: 'core/article',
            data: { email: 'a@b.com' }
        };
        const result = await validateEntry('p1', entry, schema);
        expect(result.valid).toBe(false);
        expect(
            result.issues.some(
                i => i.code === 'ENTRY_MISSING_REQUIRED_FIELD' && i.message?.includes('title')
            )
        ).toBe(true);
    });

    it('returns invalid when field value fails type validation', async () => {
        const entry: Entry = {
            id: 'e1',
            type: 'core/article',
            data: {
                title: 'Hi',
                email: 'not-an-email'
            }
        };
        const result = await validateEntry('p1', entry, schema);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'EMAIL_INVALID_FORMAT')).toBe(true);
    });

    it('skips validation for missing optional fields', async () => {
        const entry: Entry = {
            id: 'e1',
            type: 'core/article',
            data: { title: 'Hi' }
        };
        const result = await validateEntry('p1', entry, schema);
        expect(result.valid).toBe(true);
    });

    it('returns invalid when multi-select has wrong type', async () => {
        const entry: Entry = {
            id: 'e1',
            type: 'core/article',
            data: {
                title: 'Hi',
                tags: 'not-an-array'
            }
        };
        const result = await validateEntry('p1', entry, schema);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.code === 'MULTI_SELECT_INVALID_TYPE')).toBe(true);
    });
});

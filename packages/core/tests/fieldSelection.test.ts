import { describe, it, expect } from 'vitest';
import { selectFields, selectFieldsFromList } from '../src/fieldSelection.js';
import type { Entry } from '@moteurio/types/Model.js';

describe('fieldSelection', () => {
    const entry: Entry = {
        id: 'e1',
        type: 'blog-post',
        data: { title: 'Hi', body: 'Content', slug: 'hi' },
        status: 'published'
    };

    describe('selectFields', () => {
        it('returns shallow copy with all data when fields is null or empty', () => {
            const out1 = selectFields(entry, null);
            expect(out1).not.toBe(entry);
            expect(out1.data).not.toBe(entry.data);
            expect(out1.data).toEqual(entry.data);

            const out2 = selectFields(entry, []);
            expect(out2.data).toEqual(entry.data);
        });

        it('returns only specified top-level data keys', () => {
            const out = selectFields(entry, ['title', 'slug']);
            expect(out.id).toBe(entry.id);
            expect(out.type).toBe(entry.type);
            expect(out.data).toEqual({ title: 'Hi', slug: 'hi' });
        });

        it('does not mutate original entry', () => {
            const before = { ...entry, data: { ...entry.data } };
            selectFields(entry, ['title']);
            expect(entry.data).toEqual(before.data);
        });

        it('omits missing keys when fields request non-existent keys', () => {
            const out = selectFields(entry, ['title', 'nope']);
            expect(out.data).toEqual({ title: 'Hi' });
        });

        it('handles entry with empty data', () => {
            const empty: Entry = { id: 'e2', type: 'x', data: {} };
            const out = selectFields(empty, ['title']);
            expect(out.data).toEqual({});
        });
    });

    describe('selectFieldsFromList', () => {
        it('applies selectFields to each entry without mutating', () => {
            const list: Entry[] = [
                { ...entry, id: 'e1', data: { a: 1, b: 2 } },
                { ...entry, id: 'e2', data: { a: 3, b: 4 } }
            ];
            const out = selectFieldsFromList(list, ['a']);
            expect(out).toHaveLength(2);
            expect(out[0].data).toEqual({ a: 1 });
            expect(out[1].data).toEqual({ a: 3 });
            expect(list[0].data).toEqual({ a: 1, b: 2 });
        });
    });
});

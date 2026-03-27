import { describe, it, expect } from 'vitest';
import {
    parseEntryJsonStoragePath,
    entrySearchObjectId,
    buildEntrySearchRecord
} from '../../src/search/entrySearchRecord.js';

describe('entrySearchRecord', () => {
    it('parseEntryJsonStoragePath extracts model and entry ids', () => {
        expect(parseEntryJsonStoragePath('models/article/entries/e1/entry.json')).toEqual({
            modelId: 'article',
            entryId: 'e1'
        });
        expect(parseEntryJsonStoragePath('pages/foo.json')).toBeNull();
    });

    it('entrySearchObjectId is stable', () => {
        expect(entrySearchObjectId('p1', 'article', 'e1')).toBe('p1::article::e1');
    });

    it('buildEntrySearchRecord flattens data', () => {
        const rec = buildEntrySearchRecord('p1', 'article', 'e1', {
            id: 'e1',
            type: 'article',
            data: { title: 'Hello', body: { text: 'world' } },
            status: 'published'
        });
        expect(rec.objectID).toBe('p1::article::e1');
        expect(rec.title).toBe('Hello');
        expect(rec.body).toContain('world');
        expect(rec.status).toBe('published');
    });
});

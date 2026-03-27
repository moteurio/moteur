import { describe, it, expect } from 'vitest';
import { resolveEntryReferences, type EntryResolver } from '../src/referenceResolution.js';
import type { Entry } from '@moteurio/types/Model.js';

function makeEntry(id: string, type: string, data: Record<string, any> = {}): Entry {
    return { id, type, status: 'published', data };
}

function makePublishedEntry(id: string, type: string, data: Record<string, any> = {}): Entry {
    return { id, type, status: 'published', data: { ...data, _frozen: true } };
}

describe('resolveEntryReferences', () => {
    const entryA = makeEntry('a', 'posts', {
        title: 'Post A',
        author: { id: 'author-1', type: 'authors' }
    });

    const entryB = makeEntry('b', 'posts', {
        title: 'Post B',
        tags: [
            { id: 'tag-1', type: 'tags' },
            { id: 'tag-2', type: 'tags' }
        ]
    });

    const authorLatest = makeEntry('author-1', 'authors', { name: 'Alice (draft)' });
    const authorPublished = makePublishedEntry('author-1', 'authors', {
        name: 'Alice (published)'
    });
    const tag1 = makeEntry('tag-1', 'tags', { label: 'JavaScript' });
    const tag2 = makeEntry('tag-2', 'tags', { label: 'TypeScript' });

    const defaultResolver: EntryResolver = async (_proj, modelId, entryId) => {
        const map: Record<string, Entry> = {
            'authors:author-1': authorLatest,
            'tags:tag-1': tag1,
            'tags:tag-2': tag2
        };
        return map[`${modelId}:${entryId}`] ?? null;
    };

    const publishedResolver: EntryResolver = async (_proj, modelId, entryId) => {
        const map: Record<string, Entry> = {
            'authors:author-1': authorPublished,
            'tags:tag-1': tag1,
            'tags:tag-2': tag2
        };
        return map[`${modelId}:${entryId}`] ?? null;
    };

    it('uses default resolver (getEntryForProject) when none provided', async () => {
        const result = await resolveEntryReferences(
            entryA,
            'proj',
            'posts',
            1,
            new Set(),
            ['published'],
            defaultResolver
        );
        expect(result.data?.author?.data?.name).toBe('Alice (draft)');
    });

    it('uses custom resolver when provided', async () => {
        const result = await resolveEntryReferences(
            entryA,
            'proj',
            'posts',
            1,
            new Set(),
            ['published'],
            publishedResolver
        );
        expect(result.data?.author?.data?.name).toBe('Alice (published)');
        expect(result.data?.author?.data?._frozen).toBe(true);
    });

    it('resolves array references with custom resolver', async () => {
        const result = await resolveEntryReferences(
            entryB,
            'proj',
            'posts',
            1,
            new Set(),
            ['published'],
            publishedResolver
        );
        expect(result.data?.tags).toHaveLength(2);
        expect(result.data?.tags[0].data?.label).toBe('JavaScript');
        expect(result.data?.tags[1].data?.label).toBe('TypeScript');
    });

    it('does not resolve at depth 0', async () => {
        const result = await resolveEntryReferences(
            entryA,
            'proj',
            'posts',
            0,
            new Set(),
            ['published'],
            publishedResolver
        );
        expect(result.data?.author).toEqual({ id: 'author-1', type: 'authors' });
    });

    it('threads resolver through nested resolution at depth 2', async () => {
        const nestedAuthor = makeEntry('author-1', 'authors', {
            name: 'Alice',
            org: { id: 'org-1', type: 'orgs' }
        });
        const orgPublished = makePublishedEntry('org-1', 'orgs', { name: 'Acme (published)' });

        const nestedResolver: EntryResolver = async (_proj, modelId, entryId) => {
            if (modelId === 'authors' && entryId === 'author-1') return nestedAuthor;
            if (modelId === 'orgs' && entryId === 'org-1') return orgPublished;
            return null;
        };

        const result = await resolveEntryReferences(
            entryA,
            'proj',
            'posts',
            2,
            new Set(),
            ['published'],
            nestedResolver
        );

        expect(result.data?.author?.data?.name).toBe('Alice');
        expect(result.data?.author?.data?.org?.data?.name).toBe('Acme (published)');
    });

    it('leaves unresolved references as-is when resolver returns null', async () => {
        const nullResolver: EntryResolver = async () => null;
        const result = await resolveEntryReferences(
            entryA,
            'proj',
            'posts',
            1,
            new Set(),
            ['published'],
            nullResolver
        );
        expect(result.data?.author).toEqual({ id: 'author-1', type: 'authors' });
    });

    it('respects status filter even with custom resolver', async () => {
        const draftAuthor: Entry = {
            id: 'author-1',
            type: 'authors',
            status: 'draft',
            data: { name: 'Draft' }
        };
        const draftResolver: EntryResolver = async () => draftAuthor;

        const result = await resolveEntryReferences(
            entryA,
            'proj',
            'posts',
            1,
            new Set(),
            ['published'],
            draftResolver
        );
        // Author is draft, but filter is published-only — should not inline
        expect(result.data?.author).toEqual({ id: 'author-1', type: 'authors' });
    });
});

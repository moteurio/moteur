import { describe, expect, it, vi } from 'vitest';
import { moteurEntries, moteurPages } from '../src/loaders.js';

function fakeChannel() {
    const schema = vi.fn(async () => ({ locales: ['en', 'fr'] }));
    return {
        schema,
        pages: {
            list: async ({ locale }: { locale: string }) =>
                locale === 'en'
                    ? [
                          { path: '/', templateId: 'home' },
                          { path: '/docs', type: 'folder' },
                          { path: '/', templateId: 'page' }
                      ]
                    : [{ path: '/fr', templateId: 'home' }]
        },
        entries: { list: async () => [{ id: 'sanity', data: {} }] }
    };
}

function fakeContext() {
    const store = new Map<string, unknown>();
    return {
        store: {
            clear: () => store.clear(),
            has: (id: string) => store.has(id),
            set: ({ id, data }: { id: string; data: unknown }) => store.set(id, data)
        },
        parseData: async ({ data }: { data: unknown }) => data,
        generateDigest: () => 'x',
        logger: { info: vi.fn(), warn: vi.fn() },
        entries: store
    };
}

describe('loaders', () => {
    it('loads pages by address in every language, without folders, keeping the first of two', async () => {
        const channel = fakeChannel();
        const ctx = fakeContext();
        await moteurPages(channel as never).load(ctx as never);
        expect([...ctx.entries.keys()]).toEqual(['/', '/fr']);
        expect(ctx.entries.get('/fr')).toMatchObject({ locale: 'fr' });
        expect(ctx.logger.warn).toHaveBeenCalledWith('Two pages at /: kept the first.');
    });

    it('leaves out what is not in a language: it came in the default one', async () => {
        const channel = {
            schema: async () => ({ locales: ['en', 'fr'] }),
            pages: {
                list: async ({ locale }: { locale: string }) =>
                    locale === 'en'
                        ? [{ path: '/guide', locale: 'en' }]
                        : [{ path: '/guide', locale: 'en' }]
            },
            entries: {
                list: async ({ locale }: { locale: string }) => [
                    { id: 'both', locale },
                    { id: 'en-only', locale: 'en' }
                ]
            }
        };
        const pages = fakeContext();
        await moteurPages(channel as never).load(pages as never);
        expect([...pages.entries.keys()]).toEqual(['/guide']);
        expect(pages.logger.warn).not.toHaveBeenCalled();
        const entries = fakeContext();
        await moteurEntries(channel as never, 'note' as never).load(entries as never);
        expect([...entries.entries.keys()]).toEqual(['en/both', 'en/en-only', 'fr/both']);
    });

    it('asks the channel’s languages once for all its collections', async () => {
        const channel = fakeChannel();
        await moteurPages(channel as never).load(fakeContext() as never);
        const ctx = fakeContext();
        await moteurEntries(channel as never, 'rival' as never).load(ctx as never);
        expect(channel.schema).toHaveBeenCalledTimes(1);
        expect([...ctx.entries.keys()]).toEqual(['en/sanity', 'fr/sanity']);
    });

    it('loads only the languages asked for, without asking the channel', async () => {
        const channel = fakeChannel();
        const ctx = fakeContext();
        await moteurEntries(channel as never, 'rival' as never, { locales: ['en'] }).load(
            ctx as never
        );
        expect(channel.schema).not.toHaveBeenCalled();
        expect([...ctx.entries.keys()]).toEqual(['sanity']);
    });
});

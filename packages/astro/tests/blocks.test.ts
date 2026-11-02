import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { defineBlocks, defineTemplates } from '../src/index.js';
import type { BlockComponents } from '../src/blocks.js';

const Hero = () => 'hero';
const Quote = () => 'quote';

describe('defineBlocks', () => {
    // Untyped here: the types are checked by `astro check` in a site.
    const blocks = defineBlocks({ hero: Hero, 'core/quote': Quote } as never);

    it('finds a block by its type: the project’s own by their name, the server’s with their namespace', () => {
        expect(blocks.for({ type: 'hero', data: {} })).toBe(Hero);
        expect(blocks.for({ type: 'core/quote', data: {} })).toBe(Quote);
        // The server's own hero is another block than the project's.
        expect(blocks.for({ type: 'core/hero', data: {} })).toBeUndefined();
    });

    it('skips a type it has no component for, saying so once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(blocks.for({ type: 'new', data: {} })).toBeUndefined();
        blocks.for({ type: 'new', data: {} });
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('what the page shares with every block', () => {
    type Schema = {
        one: { blocks: { type: 'hero'; data: { title: string } } };
    } & Record<string, unknown>;
    type Shared = { path: string; words: Record<string, string> };

    it('is typed: a component may take part of it, never more', () => {
        type Components = BlockComponents<Schema & never, Shared>;
        const takesPart = (_: { data: { title: string }; path: string }) => null;
        const wantsMore = (_: { data: { title: string }; colour: string }) => null;
        expectTypeOf(takesPart).toMatchTypeOf<
            (props: { data: { title: string }; block: never } & Shared) => unknown
        >();
        expectTypeOf(wantsMore).not.toMatchTypeOf<
            (props: { data: { title: string }; block: never } & Shared) => unknown
        >();
        expectTypeOf<Components>().not.toBeAny();
    });
});

describe('defineTemplates', () => {
    const views = defineTemplates({ home: Hero } as never);

    it('gives the view of the page’s template', () => {
        expect(views.for({ templateId: 'home', path: '/' })).toBe(Hero);
    });

    it('leaves out the pages of a template without a view, saying so once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(views.for({ templateId: 'event', path: '/a' })).toBeUndefined();
        views.for({ templateId: 'event', path: '/b' });
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

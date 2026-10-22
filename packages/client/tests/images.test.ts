import { describe, expect, it } from 'vitest';
import {
    focalPosition,
    imageAttributes,
    imageSrcset,
    imageUrl,
    type ResolvedImage
} from '../src/images.js';

const R = 'https://api.test/static/resize/demo/a1?v=k1';
const asset = {
    url: 'https://api.test/static/assets/demo/original/a1.jpg',
    resizeUrl: R,
    width: 1200,
    height: 800,
    focalPoint: { x: 0.3, y: 0.7 },
    alt: { fr: 'Le quai', en: 'The wharf' }
};
const cover: ResolvedImage = {
    assetId: 'a1',
    alt: { fr: 'Le quai au matin' },
    caption: '',
    cropUrl: `${R}&ar=16:9`,
    aspectRatio: '16:9',
    _resolved: asset
};

describe('image helpers', () => {
    it('adds a width (and format) to the server’s address', () => {
        expect(imageUrl(asset, 640)).toBe(`${R}&w=640`);
        expect(imageUrl(asset, 640, { format: 'avif' })).toBe(`${R}&w=640&fmt=avif`);
        // A field's crop comes along, unless another shape is asked for.
        expect(imageUrl(cover, 640)).toBe(`${R}&ar=16:9&w=640`);
        expect(imageUrl(cover, 640, { ratio: '1:1' })).toBe(`${R}&ar=1:1&w=640`);
        // Not resizable: the file itself; nothing at all: nothing.
        expect(imageUrl({ url: 'https://x.test/menu.pdf' }, 640)).toBe('https://x.test/menu.pdf');
        expect(imageUrl(null, 640)).toBeUndefined();
        expect(imageUrl({ assetId: 'gone', _resolved: null }, 640)).toBeUndefined();
    });

    it('lists the widths the server makes, never wider than the original', () => {
        const set = imageSrcset(asset)!.split(', ');
        expect(set.map(s => s.split(' ')[1])).toEqual([
            '160w',
            '320w',
            '480w',
            '640w',
            '800w',
            '1024w',
            '1200w'
        ]);
        expect(set.at(-1)).toBe(`${R}&w=1280 1200w`);
        expect(imageSrcset(asset, { widths: [400, 800] })).toBe(`${R}&w=400 400w, ${R}&w=800 800w`);
        expect(imageSrcset({ url: 'https://x.test/a.svg' })).toBeUndefined();
    });

    it('gives an <img> everything: crop shape, alt in the language, sizes', () => {
        expect(
            imageAttributes(cover, { sizes: '50vw', locale: 'en', defaultLocale: 'fr' })
        ).toEqual({
            src: `${R}&ar=16:9&w=1024`,
            srcset: imageSrcset(cover),
            sizes: '50vw',
            width: 1200,
            height: 675,
            alt: 'Le quai au matin'
        });
        // No field text: the asset's, in the language asked for.
        const plain = imageAttributes({ ...cover, alt: undefined }, { locale: 'en' });
        expect(plain.alt).toBe('The wharf');
        expect(imageAttributes(asset)).toMatchObject({ width: 1200, height: 800 });
        // Decorative or missing: an empty alt, never none.
        expect(imageAttributes(null)).toEqual({ alt: '' });
    });

    it('turns the focal point into CSS', () => {
        expect(focalPosition(cover)).toBe('30% 70%');
        expect(focalPosition({ url: 'x' })).toBe('50% 50%');
    });
});

describe('in step with the server', () => {
    it('knows the same widths and shapes as core', async () => {
        const { readFile } = await import('fs/promises');
        const source = await readFile(
            new URL('../../core/src/assets/resize.ts', import.meta.url),
            'utf8'
        );
        const widths = /RESIZE_WIDTHS = \[([^\]]+)\]/.exec(source)![1].split(',').map(Number);
        const ratios = [...source.matchAll(/^\s+'(\d+:\d+)':/gm)].map(m => m[1]);
        const { IMAGE_WIDTHS, IMAGE_RATIOS } = await import('../src/images.js');
        expect([...IMAGE_WIDTHS]).toEqual(widths);
        expect([...IMAGE_RATIOS].sort()).toEqual(ratios.sort());
    });
});

import type { PaletteName } from '../../art/svg.js';
import { authors } from './authors.js';

const PALETTES: PaletteName[] = [
    'maison',
    'industrie',
    'compagnon',
    'horizon',
    'signal',
    'archive'
];

/** Portrait art for every author that has one, with a palette chosen per author. */
export const AUTHOR_ART = authors
    .filter(a => a.data.portrait)
    .map((a, i) => ({
        id: a.id,
        name: a.data.name as string,
        kind: a.data.kind as 'human' | 'robot',
        palette: PALETTES[i % PALETTES.length]
    }));

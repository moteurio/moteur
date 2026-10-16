/** Small SVG toolkit for the demo's generated artwork. Deterministic: same seed, same image. */

export type Rng = () => number;

/** mulberry32: tiny seeded PRNG. */
export function rng(seed: string): Rng {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];
export const between = (r: Rng, min: number, max: number) => min + r() * (max - min);

/** Print palettes of the Moteur Journal years (paper, ink, two spot colours, a shadow). */
export const PALETTES = {
    maison: { paper: '#efe3cc', ink: '#2b1d14', a: '#d8622b', b: '#e9b44c', shade: '#9b4a22' },
    industrie: { paper: '#e4e6e1', ink: '#1c2229', a: '#2f5d8a', b: '#f2c230', shade: '#5b6b78' },
    compagnon: { paper: '#e8eadf', ink: '#17251f', a: '#2f8a6e', b: '#e07a5f', shade: '#3d5a50' },
    horizon: { paper: '#dfe7ec', ink: '#0d1b2a', a: '#1b4965', b: '#5fa8d3', shade: '#62b6cb' },
    signal: { paper: '#f1e9e2', ink: '#1a1a1a', a: '#c0392b', b: '#2c3e50', shade: '#7f8c8d' },
    archive: { paper: '#eadfc8', ink: '#3b2f22', a: '#8a6a43', b: '#b8956a', shade: '#6d5a44' }
} as const;
export type PaletteName = keyof typeof PALETTES;
export type Palette = (typeof PALETTES)[PaletteName];

export const SANS = "'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif";
export const SERIF = "'DejaVu Serif', 'Nimbus Roman', Georgia, serif";
export const MONO = "'DejaVu Sans Mono', 'Nimbus Mono PS', Menlo, monospace";

export function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function svg(width: number, height: number, body: string, defs = ''): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`;
}

/** Halftone dot pattern, the texture of cheap 1970s print. */
export function halftone(
    id: string,
    color: string,
    size = 14,
    radius = 2.4,
    opacity = 0.35
): string {
    return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${color}" fill-opacity="${opacity}"/></pattern>`;
}

/** Fine grid (blueprint paper). */
export function grid(id: string, color: string, step = 32, opacity = 0.25): string {
    return `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1"/></pattern>`;
}

/** Paper grain: a light turbulence overlay. */
export function grain(id: string, opacity = 0.18): string {
    return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${opacity} 0"/></filter>`;
}

/** Text wrapped to a maximum number of characters per line. */
export function wrap(text: string, maxChars: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if ((line + ' ' + word).trim().length > maxChars && line) {
            lines.push(line);
            line = word;
        } else {
            line = (line + ' ' + word).trim();
        }
    }
    if (line) lines.push(line);
    return lines;
}

export function textLines(
    lines: string[],
    x: number,
    y: number,
    size: number,
    attrs: string,
    leading = 1.15
): string {
    return lines
        .map(
            (l, i) =>
                `<text x="${x}" y="${y + i * size * leading}" font-size="${size}" ${attrs}>${esc(l)}</text>`
        )
        .join('');
}

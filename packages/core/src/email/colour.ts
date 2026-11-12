/** Color helpers for email accents: WCAG contrast, and a lighter shade that stays readable on dark backgrounds. */

export const isHex = (v: unknown): v is string =>
    typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());

function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

/** Mixes `a` toward `b` by the fraction `t` (0 to 1). */
export function mix(a: string, b: string, t: number): string {
    const [p, q] = [rgb(a), rgb(b)];
    return (
        '#' +
        p
            .map((c, i) => Math.round(c + (q[i] - c) * t))
            .map(c => c.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
    );
}

/** Lightens the accent until it has a 4.5:1 contrast on a dark background, for links and buttons in dark mode. */
export function forDark(accent: string, ground: string): string {
    for (let t = 0; t <= 1; t += 0.05) {
        const shade = mix(accent, '#FFFFFF', t);
        if (contrast(shade, ground) >= 4.5) return shade;
    }
    return '#FFFFFF';
}

/** Returns near-black or white text, whichever has better contrast on this fill. */
export function textOn(fill: string, dark = '#111111'): string {
    return contrast(fill, '#FFFFFF') >= contrast(fill, dark) ? '#FFFFFF' : dark;
}

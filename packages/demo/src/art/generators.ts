import {
    MONO,
    PALETTES,
    SANS,
    SERIF,
    between,
    esc,
    grain,
    grid,
    halftone,
    pick,
    rng,
    svg,
    textLines,
    wrap,
    type Palette,
    type PaletteName
} from './svg.js';

const paper = (w: number, h: number, p: Palette) =>
    `<rect width="${w}" height="${h}" fill="${p.paper}"/>`;
const grainLayer = (w: number, h: number) =>
    `<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.9"/>`;

/** A robot drawn from geometric parts; series sets the palette, the name seeds the shapes. */
export function robotPortrait(opts: {
    name: string;
    palette: PaletteName;
    caption?: string;
}): string {
    const W = 1024;
    const H = 1024;
    const p = PALETTES[opts.palette];
    const r = rng(opts.name);
    const cx = W / 2;
    const headW = between(r, 260, 380);
    const headH = between(r, 200, 300);
    const headY = between(r, 230, 290);
    const headShape = pick(r, ['box', 'dome', 'trapezoid', 'round'] as const);
    const eyes = pick(r, ['twin', 'visor', 'cyclops', 'grid'] as const);
    const antennas = Math.floor(between(r, 0, 3));
    const torsoW = headW * between(r, 1.15, 1.5);

    let head: string;
    const hx = cx - headW / 2;
    if (headShape === 'box') {
        head = `<rect x="${hx}" y="${headY}" width="${headW}" height="${headH}" rx="18" fill="${p.a}" stroke="${p.ink}" stroke-width="8"/>`;
    } else if (headShape === 'dome') {
        head = `<path d="M ${hx} ${headY + headH} L ${hx} ${headY + headH * 0.45} A ${headW / 2} ${headH * 0.45} 0 0 1 ${hx + headW} ${headY + headH * 0.45} L ${hx + headW} ${headY + headH} Z" fill="${p.a}" stroke="${p.ink}" stroke-width="8"/>`;
    } else if (headShape === 'trapezoid') {
        const inset = headW * 0.14;
        head = `<path d="M ${hx + inset} ${headY} L ${hx + headW - inset} ${headY} L ${hx + headW} ${headY + headH} L ${hx} ${headY + headH} Z" fill="${p.a}" stroke="${p.ink}" stroke-width="8" stroke-linejoin="round"/>`;
    } else {
        head = `<ellipse cx="${cx}" cy="${headY + headH / 2}" rx="${headW / 2}" ry="${headH / 2}" fill="${p.a}" stroke="${p.ink}" stroke-width="8"/>`;
    }

    const eyeY = headY + headH * 0.45;
    let face = '';
    if (eyes === 'twin') {
        const gap = headW * 0.22;
        for (const dx of [-gap, gap]) {
            face += `<circle cx="${cx + dx}" cy="${eyeY}" r="${headW * 0.1}" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/><circle cx="${cx + dx}" cy="${eyeY}" r="${headW * 0.045}" fill="${p.ink}"/>`;
        }
    } else if (eyes === 'visor') {
        face += `<rect x="${cx - headW * 0.36}" y="${eyeY - 24}" width="${headW * 0.72}" height="48" rx="24" fill="${p.ink}"/><rect x="${cx - headW * 0.3}" y="${eyeY - 8}" width="${headW * 0.25}" height="16" rx="8" fill="${p.b}"/>`;
    } else if (eyes === 'cyclops') {
        face += `<circle cx="${cx}" cy="${eyeY}" r="${headW * 0.16}" fill="${p.ink}"/><circle cx="${cx}" cy="${eyeY}" r="${headW * 0.09}" fill="${p.b}"/><circle cx="${cx + headW * 0.04}" cy="${eyeY - headW * 0.04}" r="${headW * 0.025}" fill="${p.paper}"/>`;
    } else {
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                face += `<rect x="${cx - headW * 0.3 + i * headW * 0.22}" y="${eyeY - 30 + j * 34}" width="${headW * 0.16}" height="24" fill="${(i + j) % 2 ? p.b : p.ink}"/>`;
            }
        }
    }
    const mouthY = headY + headH * 0.78;
    for (let i = 0; i < 5; i++) {
        const x = cx - headW * 0.22 + i * headW * 0.11;
        face += `<line x1="${x}" y1="${mouthY - 14}" x2="${x}" y2="${mouthY + 14}" stroke="${p.ink}" stroke-width="7" stroke-linecap="round"/>`;
    }

    let ant = '';
    for (let i = 0; i < antennas; i++) {
        const ax = antennas === 1 ? cx : cx + (i ? 1 : -1) * headW * 0.28;
        const top = headY - between(r, 70, 130);
        ant += `<line x1="${ax}" y1="${headY}" x2="${ax}" y2="${top}" stroke="${p.ink}" stroke-width="8"/><circle cx="${ax}" cy="${top}" r="16" fill="${p.b}" stroke="${p.ink}" stroke-width="6"/>`;
    }
    if (antennas === 0) {
        ant += `<rect x="${cx - headW * 0.55}" y="${headY + headH * 0.3}" width="${headW * 0.06}" height="${headH * 0.35}" rx="6" fill="${p.b}" stroke="${p.ink}" stroke-width="6"/><rect x="${cx + headW * 0.49}" y="${headY + headH * 0.3}" width="${headW * 0.06}" height="${headH * 0.35}" rx="6" fill="${p.b}" stroke="${p.ink}" stroke-width="6"/>`;
    }

    const neckY = headY + headH;
    const torsoY = neckY + 46;
    const torsoH = 300;
    let torso = `<rect x="${cx - 40}" y="${neckY}" width="80" height="50" fill="${p.shade}" stroke="${p.ink}" stroke-width="8"/>`;
    torso += `<path d="M ${cx - torsoW / 2} ${torsoY + torsoH} L ${cx - torsoW / 2 + 30} ${torsoY} L ${cx + torsoW / 2 - 30} ${torsoY} L ${cx + torsoW / 2} ${torsoY + torsoH} Z" fill="${p.shade}" stroke="${p.ink}" stroke-width="8" stroke-linejoin="round"/>`;
    torso += `<rect x="${cx - torsoW * 0.28}" y="${torsoY + 50}" width="${torsoW * 0.56}" height="130" rx="10" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>`;
    for (let i = 0; i < 3; i++) {
        torso += `<circle cx="${cx - torsoW * 0.16 + i * torsoW * 0.16}" cy="${torsoY + 100}" r="22" fill="${pick(r, [p.a, p.b, p.ink])}" stroke="${p.ink}" stroke-width="5"/>`;
    }
    torso += `<rect x="${cx - torsoW * 0.22}" y="${torsoY + 140}" width="${torsoW * 0.44}" height="14" rx="7" fill="${p.ink}"/><rect x="${cx - torsoW * 0.22}" y="${torsoY + 140}" width="${torsoW * 0.44 * between(r, 0.3, 0.95)}" height="14" rx="7" fill="${p.a}"/>`;

    const sunR = between(r, 280, 360);
    const body = [
        paper(W, H, p),
        `<circle cx="${cx + between(r, -120, 120)}" cy="${headY + 120}" r="${sunR}" fill="${p.b}" opacity="0.55"/>`,
        `<rect width="${W}" height="${H}" fill="url(#dots)"/>`,
        torso,
        head,
        face,
        ant,
        `<rect x="0" y="${H - 120}" width="${W}" height="120" fill="${p.ink}"/>`,
        `<text x="56" y="${H - 50}" font-family="${MONO}" font-size="44" font-weight="bold" fill="${p.paper}" letter-spacing="4">${esc(opts.name)}</text>`,
        opts.caption
            ? `<text x="${W - 56}" y="${H - 52}" text-anchor="end" font-family="${MONO}" font-size="26" fill="${p.b}">${esc(opts.caption)}</text>`
            : '',
        grainLayer(W, H)
    ].join('');
    return svg(W, H, body, halftone('dots', p.ink, 16, 2.2, 0.18) + grain('grain'));
}

const COVER_MOTIFS = {
    dawn(p: Palette, r: () => number) {
        let s = `<rect x="0" y="900" width="1200" height="700" fill="${p.a}"/>`;
        s += `<circle cx="600" cy="900" r="300" fill="${p.b}"/>`;
        for (let i = 0; i < 14; i++) {
            const a = Math.PI + (i / 13) * Math.PI;
            s += `<line x1="${600 + Math.cos(a) * 340}" y1="${900 + Math.sin(a) * 340}" x2="${600 + Math.cos(a) * 520}" y2="${900 + Math.sin(a) * 520}" stroke="${p.ink}" stroke-width="10" stroke-linecap="round"/>`;
        }
        s += `<rect x="0" y="895" width="1200" height="14" fill="${p.ink}"/>`;
        return (
            s +
            `<rect x="${380 + r() * 40}" y="1010" width="440" height="230" fill="${p.ink}"/><rect x="420" y="1060" width="360" height="180" fill="${p.b}" opacity="0.85"/>`
        );
    },
    home(p: Palette) {
        return `<rect x="0" y="1060" width="1200" height="540" fill="${p.a}"/><path d="M 300 1060 L 300 740 L 600 520 L 900 740 L 900 1060 Z" fill="${p.paper}" stroke="${p.ink}" stroke-width="14"/><rect x="520" y="860" width="160" height="200" fill="${p.ink}"/><rect x="370" y="790" width="110" height="110" fill="${p.b}" stroke="${p.ink}" stroke-width="10"/><rect x="720" y="790" width="110" height="110" fill="${p.b}" stroke="${p.ink}" stroke-width="10"/><circle cx="775" cy="835" r="22" fill="${p.ink}"/><rect x="755" y="860" width="40" height="34" fill="${p.ink}"/>`;
    },
    factory(p: Palette) {
        let s = `<rect x="0" y="1100" width="1200" height="500" fill="${p.ink}"/>`;
        for (let i = 0; i < 5; i++) {
            const x = 80 + i * 210;
            s += `<path d="M ${x} 1100 L ${x} 860 L ${x + 210} 760 L ${x + 210} 1100 Z" fill="${p.a}" stroke="${p.ink}" stroke-width="10"/><rect x="${x + 120}" y="800" width="60" height="70" fill="${p.b}"/>`;
        }
        for (const x of [180, 520, 940]) {
            s += `<rect x="${x}" y="560" width="56" height="300" fill="${p.shade}" stroke="${p.ink}" stroke-width="10"/><circle cx="${x + 40}" cy="520" r="44" fill="${p.paper}" opacity="0.8"/><circle cx="${x + 90}" cy="470" r="34" fill="${p.paper}" opacity="0.6"/>`;
        }
        return s;
    },
    bond(p: Palette) {
        return `<circle cx="480" cy="900" r="260" fill="${p.a}" opacity="0.95"/><circle cx="720" cy="900" r="260" fill="${p.b}" opacity="0.85" style="mix-blend-mode:multiply"/><circle cx="480" cy="860" r="40" fill="${p.ink}"/><rect x="680" y="820" width="80" height="80" rx="10" fill="${p.ink}"/>`;
    },
    edge(p: Palette) {
        let s = `<rect x="0" y="760" width="1200" height="840" fill="${p.a}"/>`;
        for (let i = 0; i < 9; i++) {
            const y = 800 + i * 80;
            s += `<path d="M 0 ${y} Q 150 ${y - 30} 300 ${y} T 600 ${y} T 900 ${y} T 1200 ${y}" fill="none" stroke="${p.shade}" stroke-width="8" opacity="${0.9 - i * 0.08}"/>`;
        }
        s += `<ellipse cx="760" cy="1260" rx="150" ry="56" fill="${p.b}" stroke="${p.ink}" stroke-width="10"/><rect x="740" y="1170" width="40" height="50" fill="${p.ink}"/><circle cx="700" cy="1260" r="14" fill="${p.paper}"/><circle cx="760" cy="1260" r="14" fill="${p.paper}"/>`;
        return s + `<circle cx="300" cy="560" r="80" fill="${p.paper}" opacity="0.9"/>`;
    },
    signal(p: Palette) {
        let s = `<line x1="600" y1="1300" x2="600" y2="820" stroke="${p.ink}" stroke-width="18"/><path d="M 480 1300 L 600 820 L 720 1300" fill="none" stroke="${p.ink}" stroke-width="12"/>`;
        for (let i = 1; i <= 6; i++) {
            s += `<path d="M ${600 - i * 80} ${820 - i * 30} A ${i * 90} ${i * 90} 0 0 1 ${600 + i * 80} ${820 - i * 30}" fill="none" stroke="${i % 2 ? p.a : p.b}" stroke-width="16" stroke-linecap="round"/>`;
        }
        return s + `<circle cx="600" cy="810" r="26" fill="${p.a}"/>`;
    },
    zero(p: Palette) {
        let s = '';
        for (let i = 0; i < 30; i++) {
            s += `<line x1="${150 + i * 30}" y1="560" x2="${150 + i * 30 - 300}" y2="1360" stroke="${p.shade}" stroke-width="4"/>`;
        }
        return (
            s +
            `<rect x="360" y="700" width="480" height="480" fill="${p.paper}" stroke="${p.ink}" stroke-width="14"/><text x="600" y="1060" text-anchor="middle" font-family="${SERIF}" font-size="360" font-weight="bold" fill="${p.a}">0</text>`
        );
    }
} as const;
export type CoverMotif = keyof typeof COVER_MOTIFS;

/** A magazine cover: masthead, issue number, bilingual title, one central motif. */
export function issueCover(opts: {
    number: string;
    titleFr: string;
    titleEn: string;
    dateline: string;
    motif: CoverMotif;
    palette: PaletteName;
    price?: string;
}): string {
    const W = 1200;
    const H = 1600;
    const p = PALETTES[opts.palette];
    const r = rng(opts.number + opts.titleFr);
    const titleLines = wrap(opts.titleFr.toUpperCase(), 14);
    const body = [
        paper(W, H, p),
        `<rect width="${W}" height="${H}" fill="url(#dots)"/>`,
        COVER_MOTIFS[opts.motif](p, r),
        `<text x="60" y="190" font-family="${SANS}" font-weight="bold" font-size="190" fill="${p.ink}" letter-spacing="-6">MOTEUR</text>`,
        `<text x="66" y="250" font-family="${MONO}" font-size="40" fill="${p.ink}" letter-spacing="22">JOURNAL</text>`,
        `<text x="${W - 60}" y="250" text-anchor="end" font-family="${MONO}" font-size="34" fill="${p.ink}">${esc(opts.dateline)}</text>`,
        `<rect x="60" y="280" width="${W - 120}" height="10" fill="${p.ink}"/>`,
        `<text x="${W - 60}" y="520" text-anchor="end" font-family="${SERIF}" font-weight="bold" font-size="250" fill="${p.a}">${esc(opts.number)}</text>`,
        textLines(
            titleLines,
            60,
            400,
            86,
            `font-family="${SANS}" font-weight="bold" fill="${p.ink}"`,
            1.02
        ),
        `<text x="62" y="${400 + titleLines.length * 88 + 10}" font-family="${SERIF}" font-style="italic" font-size="48" fill="${p.shade}">${esc(opts.titleEn)}</text>`,
        `<rect x="0" y="${H - 110}" width="${W}" height="110" fill="${p.ink}"/>`,
        `<text x="60" y="${H - 42}" font-family="${MONO}" font-size="34" fill="${p.paper}">MONTRÉAL · ÉDITION BILINGUE · BILINGUAL EDITION</text>`,
        `<text x="${W - 60}" y="${H - 40}" text-anchor="end" font-family="${MONO}" font-weight="bold" font-size="44" fill="${p.b}">${esc(opts.price ?? '75¢')}</text>`,
        grainLayer(W, H)
    ].join('');
    return svg(W, H, body, halftone('dots', p.ink, 18, 2.4, 0.12) + grain('grain', 0.16));
}

/** Duotone portrait: a human silhouette or a robot head, with initials. */
export function authorPortrait(opts: {
    name: string;
    kind: 'human' | 'robot';
    palette: PaletteName;
}): string {
    const W = 800;
    const H = 800;
    const p = PALETTES[opts.palette];
    const r = rng(opts.name);
    const initials = opts.name
        .replace(/^(Dr\.|Mme|M\.)\s+/, '')
        .split(/[\s-]+/)
        .filter(w => /^[A-ZÀ-Ý0-9]/.test(w))
        .slice(0, 2)
        .map(w => w[0])
        .join('');
    let figure: string;
    if (opts.kind === 'robot') {
        figure = `<rect x="250" y="250" width="300" height="260" rx="30" fill="${p.a}" stroke="${p.ink}" stroke-width="12"/><rect x="290" y="330" width="220" height="56" rx="28" fill="${p.ink}"/><circle cx="${330 + r() * 140}" cy="358" r="18" fill="${p.b}"/><line x1="400" y1="250" x2="400" y2="170" stroke="${p.ink}" stroke-width="12"/><circle cx="400" cy="160" r="22" fill="${p.b}" stroke="${p.ink}" stroke-width="10"/><path d="M 170 800 Q 190 560 400 540 Q 610 560 630 800 Z" fill="${p.shade}" stroke="${p.ink}" stroke-width="12"/>`;
    } else {
        const hair = pick(r, ['short', 'long', 'bun', 'none'] as const);
        figure = `<path d="M 150 800 Q 170 540 400 520 Q 630 540 650 800 Z" fill="${p.a}"/>`;
        figure += `<ellipse cx="400" cy="340" rx="120" ry="150" fill="${p.shade}"/>`;
        if (hair === 'short')
            figure += `<path d="M 278 320 Q 290 170 400 172 Q 512 170 522 320 Q 470 240 400 250 Q 330 240 278 320 Z" fill="${p.ink}"/>`;
        if (hair === 'long')
            figure += `<path d="M 270 520 Q 250 180 400 170 Q 550 180 530 520 L 500 520 Q 520 300 400 250 Q 280 300 300 520 Z" fill="${p.ink}"/>`;
        if (hair === 'bun')
            figure += `<circle cx="400" cy="160" r="52" fill="${p.ink}"/><path d="M 280 300 Q 300 190 400 190 Q 500 190 520 300 Q 460 230 400 236 Q 340 230 280 300 Z" fill="${p.ink}"/>`;
        figure += `<rect x="330" y="320" width="140" height="16" rx="8" fill="${p.ink}" opacity="${r() > 0.5 ? 0.85 : 0}"/>`;
    }
    const body = [
        `<rect width="${W}" height="${H}" fill="${p.b}"/>`,
        `<rect width="${W}" height="${H}" fill="url(#dots)"/>`,
        figure,
        `<text x="${W - 40}" y="90" text-anchor="end" font-family="${SANS}" font-weight="bold" font-size="72" fill="${p.ink}" opacity="0.85">${esc(initials)}</text>`,
        grainLayer(W, H)
    ].join('');
    return svg(W, H, body, halftone('dots', p.ink, 14, 2, 0.22) + grain('grain', 0.2));
}

const SCENES = {
    blueprint(W: number, H: number, p: Palette, r: () => number, label: string) {
        const ink = '#e8f1f8';
        let s = `<rect width="${W}" height="${H}" fill="#1d3f6e"/><rect width="${W}" height="${H}" fill="url(#grid)"/>`;
        const cx = W * 0.42;
        const cy = H * 0.55;
        s += `<circle cx="${cx}" cy="${cy}" r="180" fill="none" stroke="${ink}" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="60" fill="none" stroke="${ink}" stroke-width="4"/>`;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            s += `<rect x="${cx + Math.cos(a) * 180 - 16}" y="${cy + Math.sin(a) * 180 - 16}" width="32" height="32" fill="none" stroke="${ink}" stroke-width="3" transform="rotate(${(a * 180) / Math.PI} ${cx + Math.cos(a) * 180} ${cy + Math.sin(a) * 180})"/>`;
        }
        const armA = between(r, -0.9, -0.4);
        const ex = cx + Math.cos(armA) * 420;
        const ey = cy + Math.sin(armA) * 420;
        s += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${ink}" stroke-width="22" stroke-linecap="round" opacity="0.9"/><circle cx="${ex}" cy="${ey}" r="36" fill="none" stroke="${ink}" stroke-width="5"/><path d="M ${ex + 30} ${ey - 20} l 70 -30 M ${ex + 30} ${ey + 20} l 70 30" stroke="${ink}" stroke-width="10" stroke-linecap="round"/>`;
        s += `<line x1="${cx - 180}" y1="${cy + 240}" x2="${cx + 180}" y2="${cy + 240}" stroke="${ink}" stroke-width="2"/><text x="${cx}" y="${cy + 275}" text-anchor="middle" font-family="${MONO}" font-size="26" fill="${ink}">Ø 360 mm</text>`;
        s += `<rect x="${W - 520}" y="${H - 190}" width="480" height="150" fill="none" stroke="${ink}" stroke-width="3"/><text x="${W - 500}" y="${H - 140}" font-family="${MONO}" font-size="28" fill="${ink}">MOTEUR INDUSTRIES S.A.</text><text x="${W - 500}" y="${H - 95}" font-family="${MONO}" font-size="24" fill="${ink}">${esc(label)}</text><text x="${W - 500}" y="${H - 60}" font-family="${MONO}" font-size="20" fill="${ink}">ÉCHELLE 1:4 · FEUILLE ${Math.ceil(r() * 9)}/9</text>`;
        return s;
    },
    skyline(W: number, H: number, p: Palette, r: () => number) {
        let s = `<rect width="${W}" height="${H}" fill="${p.b}"/><circle cx="${W * 0.72}" cy="${H * 0.32}" r="120" fill="${p.paper}" opacity="0.9"/>`;
        s += `<path d="M 0 ${H * 0.7} Q ${W * 0.25} ${H * 0.38} ${W * 0.5} ${H * 0.62} L ${W * 0.5} ${H} L 0 ${H} Z" fill="${p.shade}"/>`;
        s += `<line x1="${W * 0.24}" y1="${H * 0.47}" x2="${W * 0.24}" y2="${H * 0.36}" stroke="${p.ink}" stroke-width="8"/><line x1="${W * 0.22}" y1="${H * 0.39}" x2="${W * 0.26}" y2="${H * 0.39}" stroke="${p.ink}" stroke-width="8"/>`;
        let x = W * 0.36;
        while (x < W) {
            const w = between(r, 60, 140);
            const h = between(r, H * 0.12, H * 0.42);
            s += `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="${p.ink}"/>`;
            for (let wy = H - h + 20; wy < H - 20; wy += 34) {
                for (let wx = x + 12; wx < x + w - 16; wx += 26) {
                    if (r() > 0.55)
                        s += `<rect x="${wx}" y="${wy}" width="12" height="16" fill="${p.b}"/>`;
                }
            }
            x += w + between(r, 4, 20);
        }
        s += `<path d="M ${W * 0.08} ${H} Q ${W * 0.2} ${H * 0.74} ${W * 0.34} ${H} Z" fill="${p.a}"/><path d="M ${W * 0.3} ${H * 0.86} L ${W * 0.27} ${H * 0.6}" stroke="${p.a}" stroke-width="22" stroke-linecap="round"/>`;
        return s;
    },
    factory(W: number, H: number, p: Palette, r: () => number) {
        let s = `<rect width="${W}" height="${H}" fill="${p.ink}"/>`;
        for (let i = 0; i < 6; i++) {
            const x = 60 + i * (W / 6);
            const lamp = `<path d="M ${x + 60} 0 L ${x + 60} 120 M ${x + 20} 150 L ${x + 100} 150 L ${x + 60} 110 Z" stroke="${p.b}" stroke-width="6" fill="${p.b}"/><path d="M ${x + 20} 150 L ${x - 60} ${H} L ${x + 180} ${H} L ${x + 100} 150 Z" fill="${p.b}" opacity="0.12"/>`;
            const base = H * 0.78;
            const a1 = between(r, -1.2, -0.5);
            const j1x = x + 60 + Math.cos(a1) * 170;
            const j1y = base + Math.sin(a1) * 170;
            const arm = `<rect x="${x}" y="${base}" width="120" height="${H - base}" fill="${p.shade}"/><line x1="${x + 60}" y1="${base}" x2="${j1x}" y2="${j1y}" stroke="${p.a}" stroke-width="30" stroke-linecap="round"/><line x1="${j1x}" y1="${j1y}" x2="${j1x + 110}" y2="${j1y + 60}" stroke="${p.a}" stroke-width="22" stroke-linecap="round"/><circle cx="${j1x}" cy="${j1y}" r="20" fill="${p.paper}"/>`;
            s += lamp + arm;
        }
        return (
            s + `<rect x="0" y="${H - 40}" width="${W}" height="40" fill="${p.b}" opacity="0.6"/>`
        );
    },
    ocean(W: number, H: number, p: Palette, r: () => number) {
        let s = `<rect width="${W}" height="${H}" fill="url(#deep)"/>`;
        for (let i = 0; i < 40; i++) {
            s += `<circle cx="${r() * W}" cy="${r() * H}" r="${between(r, 2, 10)}" fill="none" stroke="${p.paper}" stroke-opacity="0.4" stroke-width="2"/>`;
        }
        s += `<path d="M 0 ${H * 0.86} Q ${W * 0.3} ${H * 0.78} ${W * 0.55} ${H * 0.88} T ${W} ${H * 0.82} L ${W} ${H} L 0 ${H} Z" fill="${p.ink}"/>`;
        s += `<g transform="translate(${W * 0.55} ${H * 0.5})"><ellipse rx="220" ry="70" fill="${p.b}" stroke="${p.ink}" stroke-width="10"/><rect x="-40" y="-120" width="80" height="60" fill="${p.b}" stroke="${p.ink}" stroke-width="10"/><circle cx="-80" r="20" fill="${p.paper}"/><circle cx="0" r="20" fill="${p.paper}"/><circle cx="80" r="20" fill="${p.paper}"/><path d="M 220 0 L 600 -120 L 600 120 Z" fill="${p.paper}" opacity="0.15"/></g>`;
        return s;
    },
    garage(W: number, H: number, p: Palette, r: () => number) {
        let s = `<rect width="${W}" height="${H}" fill="#1b2433"/>`;
        for (let i = 0; i < 120; i++)
            s += `<circle cx="${r() * W}" cy="${r() * H * 0.7}" r="${between(r, 1.5, 4)}" fill="#ffffff" opacity="0.7"/>`;
        s += `<rect x="0" y="${H * 0.8}" width="${W}" height="${H * 0.2}" fill="#e9eef3"/>`;
        s += `<rect x="${W * 0.25}" y="${H * 0.3}" width="${W * 0.5}" height="${H * 0.5}" fill="${p.shade}" stroke="${p.ink}" stroke-width="10"/><rect x="${W * 0.32}" y="${H * 0.45}" width="${W * 0.36}" height="${H * 0.35}" fill="${p.b}"/><path d="M ${W * 0.32} ${H * 0.8} L ${W * 0.2} ${H} L ${W * 0.8} ${H} L ${W * 0.68} ${H * 0.8} Z" fill="${p.b}" opacity="0.4"/>`;
        s += `<rect x="${W * 0.44}" y="${H * 0.6}" width="${W * 0.12}" height="${H * 0.2}" fill="${p.ink}"/><circle cx="${W * 0.5}" cy="${H * 0.56}" r="${H * 0.05}" fill="${p.ink}"/>`;
        return (
            s +
            `<text x="${W * 0.5}" y="${H * 0.26}" text-anchor="middle" font-family="${MONO}" font-size="34" fill="#e9eef3">RUE SAINT-DENIS · 1968</text>`
        );
    }
} as const;
export type SceneKind = keyof typeof SCENES;

/** A wide illustration (articles, pages, heroes). */
export function scene(opts: {
    kind: SceneKind;
    seed: string;
    palette: PaletteName;
    label?: string;
}): string {
    const W = 1600;
    const H = 1000;
    const p = PALETTES[opts.palette];
    const r = rng(opts.seed);
    const defs =
        grid('grid', '#e8f1f8', 40, 0.22) +
        grain('grain', 0.14) +
        `<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.shade}"/><stop offset="1" stop-color="${p.ink}"/></linearGradient>`;
    return svg(
        W,
        H,
        SCENES[opts.kind](W, H, p, r, opts.label ?? opts.seed.toUpperCase()) + grainLayer(W, H),
        defs
    );
}

/** A typographic event poster. */
export function poster(opts: {
    title: string;
    subtitle: string;
    date: string;
    place: string;
    palette: PaletteName;
}): string {
    const W = 1200;
    const H = 1600;
    const p = PALETTES[opts.palette];
    const r = rng(opts.title);
    let shapes = '';
    for (let i = 0; i < 7; i++) {
        const size = between(r, 120, 420);
        const x = between(r, -100, W - 100);
        const y = between(r, 300, 1100);
        shapes += pick(r, [
            `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${pick(r, [p.a, p.b, p.shade])}" opacity="0.9"/>`,
            `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${pick(r, [p.a, p.b, p.shade])}" opacity="0.9" transform="rotate(${between(r, -20, 20)} ${x} ${y})"/>`,
            `<path d="M ${x} ${y + size} L ${x + size / 2} ${y} L ${x + size} ${y + size} Z" fill="${pick(r, [p.a, p.b, p.shade])}" opacity="0.9"/>`
        ]);
    }
    const lines = wrap(opts.title.toUpperCase(), 12);
    const body = [
        paper(W, H, p),
        shapes,
        `<rect width="${W}" height="${H}" fill="url(#dots)"/>`,
        `<rect x="0" y="0" width="${W}" height="260" fill="${p.ink}"/>`,
        `<text x="60" y="150" font-family="${MONO}" font-size="56" font-weight="bold" fill="${p.b}">${esc(opts.date)}</text>`,
        `<text x="60" y="215" font-family="${MONO}" font-size="34" fill="${p.paper}">${esc(opts.place)}</text>`,
        textLines(
            lines,
            60,
            H - 120 - (lines.length - 1) * 120,
            120,
            `font-family="${SANS}" font-weight="bold" fill="${p.ink}"`,
            1
        ),
        `<text x="62" y="${H - 50}" font-family="${SERIF}" font-style="italic" font-size="44" fill="${p.ink}">${esc(opts.subtitle)}</text>`,
        grainLayer(W, H)
    ].join('');
    return svg(W, H, body, halftone('dots', p.ink, 16, 2.2, 0.12) + grain('grain', 0.16));
}

/** A simple bar chart in the journal's style (data journalism illustrations). */
export function chart(opts: {
    title: string;
    unit: string;
    bars: Array<{ label: string; value: number }>;
    palette: PaletteName;
}): string {
    const W = 1600;
    const H = 1000;
    const p = PALETTES[opts.palette];
    const max = Math.max(...opts.bars.map(b => b.value));
    const left = 140;
    const bottom = H - 140;
    const top = 220;
    const bw = (W - left - 80) / opts.bars.length;
    let bars = '';
    opts.bars.forEach((b, i) => {
        const h = ((bottom - top) * b.value) / max;
        const x = left + i * bw + bw * 0.15;
        bars += `<rect x="${x}" y="${bottom - h}" width="${bw * 0.7}" height="${h}" fill="${i === opts.bars.length - 1 ? p.a : p.shade}"/><text x="${x + bw * 0.35}" y="${bottom - h - 16}" text-anchor="middle" font-family="${MONO}" font-size="28" fill="${p.ink}">${b.value.toLocaleString('fr-CA')}</text><text x="${x + bw * 0.35}" y="${bottom + 50}" text-anchor="middle" font-family="${MONO}" font-size="28" fill="${p.ink}">${esc(b.label)}</text>`;
    });
    let ticks = '';
    for (let i = 0; i <= 4; i++) {
        const y = bottom - ((bottom - top) * i) / 4;
        ticks += `<line x1="${left}" y1="${y}" x2="${W - 80}" y2="${y}" stroke="${p.ink}" stroke-opacity="0.15" stroke-width="2"/>`;
    }
    const body = [
        paper(W, H, p),
        ticks,
        bars,
        `<line x1="${left}" y1="${bottom}" x2="${W - 80}" y2="${bottom}" stroke="${p.ink}" stroke-width="4"/>`,
        `<text x="${left}" y="120" font-family="${SANS}" font-weight="bold" font-size="56" fill="${p.ink}">${esc(opts.title)}</text>`,
        `<text x="${left}" y="170" font-family="${MONO}" font-size="28" fill="${p.shade}">${esc(opts.unit)}</text>`
    ].join('');
    return svg(W, H, body);
}

/** The Moteur logo mark, as SVG (stays SVG in the media library). */
export function logo(color = '#1a1a1a', accent = '#d8622b'): string {
    return svg(
        512,
        512,
        `<rect width="512" height="512" rx="96" fill="${accent}"/><circle cx="256" cy="256" r="150" fill="none" stroke="${color}" stroke-width="40"/><circle cx="256" cy="256" r="46" fill="${color}"/>${[0, 60, 120, 180, 240, 300].map(a => `<rect x="236" y="70" width="40" height="70" rx="10" fill="${color}" transform="rotate(${a} 256 256)"/>`).join('')}`
    );
}

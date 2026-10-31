import { forDark, textOn } from './colour.js';
import type { EmailLocale, EmailLook } from './settings.js';

/**
 * One layout for every email the engine sends: small, table-based and inline-styled, so it reads
 * the same in Gmail, Outlook (its Word engine too), Apple Mail and phones. No web fonts, no
 * remote images unless the operator set a logo URL, no tracking. A `<style>` block only adds a
 * dark palette and phone padding; without it the email is still whole.
 */

/** Text with some parts in bold. */
export type Rich = string | (string | { strong: string })[];

export type Block =
    | { t: 'h'; text: string }
    | { t: 'p'; text: Rich }
    /** A one-time code: shown spaced, copied without the space. */
    | { t: 'code'; code: string }
    /** The one action. `fallback` introduces the bare address for when the button can't be pressed. */
    | { t: 'button'; label: string; href: string; fallback: string }
    | { t: 'steps'; items: { text: string; href?: string }[] }
    | { t: 'facts'; rows: { label: string; value: string }[] }
    | { t: 'note'; text: Rich }
    | { t: 'sign'; text: string };

/** What one email says, before it has a look. */
export interface EmailContent {
    subject: string;
    /** The line inboxes show after the subject. */
    preheader: string;
    blocks: Block[];
    /** Why the reader got it, at the foot. */
    why?: Rich;
    /** Notifications only: the page that stops them (also sent as List-Unsubscribe). */
    unsubscribe?: { label: string; href: string };
    /** Mail a project sends to its own people: its name heads it, not the product's. */
    sender?: { name: string };
    /** The plain-text part as it must read, when not built from the blocks (form mail). */
    text?: string;
}

export interface Brand {
    productName: string;
    accent?: string;
    /** `cid:` or https URL of the logo, with its width. */
    logo?: { src: string; width: number };
    footer?: string;
    supportUrl?: string;
}

/** A design direction: how one look sets an email. */
export interface Design {
    id: string;
    look: EmailLook;
    name: string;
    /** Content in a raised, outlined box, or straight on the ground. */
    frame: 'card' | 'open';
    /** The product's name heads the email as a word, or on a dark band. */
    header: 'wordmark' | 'band';
    /** Discothèque's four stripes: a small mark by the name, a band at the foot, or none. */
    stripes: 'mark' | 'foot' | 'band' | 'none';
    /** Folio: a line of accent along the top of the box. */
    topLine?: boolean;
    code: 'ticket' | 'typewriter' | 'well';
    button: 'solid' | 'outline';
}

export const DESIGNS: Design[] = [
    {
        id: 'disco-ticket',
        look: 'discotheque',
        name: 'Ticket',
        frame: 'card',
        header: 'wordmark',
        stripes: 'mark',
        code: 'ticket',
        button: 'solid'
    },
    {
        id: 'disco-letter',
        look: 'discotheque',
        name: 'Letter',
        frame: 'open',
        header: 'wordmark',
        stripes: 'foot',
        code: 'typewriter',
        button: 'outline'
    },
    {
        id: 'disco-marquee',
        look: 'discotheque',
        name: 'Marquee',
        frame: 'card',
        header: 'band',
        stripes: 'band',
        code: 'ticket',
        button: 'solid'
    },
    {
        id: 'folio-card',
        look: 'folio',
        name: 'Card',
        frame: 'card',
        header: 'wordmark',
        stripes: 'none',
        code: 'well',
        button: 'solid'
    },
    {
        id: 'folio-sheet',
        look: 'folio',
        name: 'Sheet',
        frame: 'open',
        header: 'wordmark',
        stripes: 'none',
        code: 'well',
        button: 'solid'
    },
    {
        id: 'folio-tab',
        look: 'folio',
        name: 'Tab',
        frame: 'card',
        header: 'wordmark',
        stripes: 'none',
        topLine: true,
        code: 'well',
        button: 'solid'
    }
];

/** The design each look uses until the owner picks (see the email lab). */
export const DEFAULT_DESIGN: Record<EmailLook, string> = {
    discotheque: 'disco-ticket',
    folio: 'folio-card'
};

export function designFor(look: EmailLook, id?: string): Design {
    return (
        DESIGNS.find(d => d.id === id && d.look === look) ??
        DESIGNS.find(d => d.id === DEFAULT_DESIGN[look])!
    );
}

type Palette = {
    ground: string;
    card: string;
    ink: string;
    muted: string;
    rule: string;
    /** The outline of the box and of controls. */
    edge: string;
    action: string;
    onAction: string;
    link: string;
    codeFill: string;
    codeInk: string;
    codeEdge: string;
    band: string;
    onBand: string;
    stripes: string[];
};

/** From @moteurio/design's tokens (foundations.md), light then dark. */
const PALETTES: Record<EmailLook, { light: Palette; dark: Palette }> = {
    discotheque: {
        light: {
            ground: '#F7EBD0',
            card: '#FFFAF0',
            ink: '#3B2416',
            muted: '#6B4F36',
            rule: '#D9C49A',
            edge: '#3B2416',
            action: '#B8491A',
            onAction: '#FFFFFF',
            link: '#A8401A',
            codeFill: '#E1A730',
            codeInk: '#3B2416',
            codeEdge: '#3B2416',
            band: '#3B2416',
            onBand: '#F7EBD0',
            stripes: ['#A8401A', '#D9622B', '#E1A730', '#7A8B3A']
        },
        dark: {
            ground: '#1C110A',
            card: '#2A1A10',
            ink: '#F7EBD0',
            muted: '#C9B28A',
            rule: '#4A3020',
            edge: '#F7EBD0',
            action: '#E57A47',
            onAction: '#1C110A',
            link: '#F0A27A',
            codeFill: '#E1A730',
            codeInk: '#3B2416',
            codeEdge: '#E1A730',
            band: '#0E0805',
            onBand: '#F7EBD0',
            stripes: ['#F0A27A', '#E57A47', '#E1A730', '#9DB050']
        }
    },
    folio: {
        light: {
            ground: '#F5F6F8',
            card: '#FFFFFF',
            ink: '#1A2029',
            muted: '#4F5A68',
            rule: '#DDE1E6',
            edge: '#DDE1E6',
            action: '#1F5FC4',
            onAction: '#FFFFFF',
            link: '#1C56B3',
            codeFill: '#EDEFF2',
            codeInk: '#1A2029',
            codeEdge: '#DDE1E6',
            band: '#FFFFFF',
            onBand: '#1A2029',
            stripes: []
        },
        dark: {
            ground: '#111418',
            card: '#191D23',
            ink: '#E8EBEF',
            muted: '#AAB3BF',
            rule: '#2C333C',
            edge: '#2C333C',
            action: '#6EA0F2',
            onAction: '#0D1014',
            link: '#8DB4F5',
            codeFill: '#0D1014',
            codeInk: '#E8EBEF',
            codeEdge: '#2C333C',
            band: '#191D23',
            onBand: '#E8EBEF',
            stripes: []
        }
    }
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONTS: Record<EmailLook, { display: string; body: string }> = {
    discotheque: {
        display: "Fraunces, Georgia, 'Times New Roman', Times, serif",
        body: `Karla, ${SANS}`
    },
    folio: { display: `'IBM Plex Sans', ${SANS}`, body: `'IBM Plex Sans', ${SANS}` }
};
const MONO =
    "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace";
const TYPEWRITER = "'Courier Prime', 'Courier New', Courier, monospace";

export const esc = (s: string) =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const plain = (r: Rich): string =>
    typeof r === 'string' ? r : r.map(p => (typeof p === 'string' ? p : p.strong)).join('');

function palettes(design: Design, brand: Brand): { light: Palette; dark: Palette } {
    const base = PALETTES[design.look];
    const light = { ...base.light };
    const dark = { ...base.dark };
    if (design.frame === 'open' && design.look === 'folio') {
        light.ground = light.card;
        dark.ground = dark.card;
    }
    if (design.frame === 'open' && design.look === 'discotheque') {
        light.card = light.ground;
        dark.card = dark.ground;
    }
    if (brand.accent) {
        light.action = brand.accent;
        light.onAction = '#FFFFFF';
        light.link = brand.accent;
        dark.action = forDark(brand.accent, dark.card);
        dark.onAction = textOn(dark.action, dark.ground);
        dark.link = forDark(brand.accent, dark.card);
    }
    return { light, dark };
}

/** The `<style>` block: dark palette (Apple Mail, iOS, Outlook.com), phone padding. */
function styles(design: Design, d: Palette): string {
    const solid = design.button === 'solid';
    const typed = design.code === 'typewriter';
    // [class, colour, background, border]: one list, written for each client's dark mode.
    const rows: [string, string?, string?, string?][] = [
        ['m-ground', undefined, d.ground],
        ['m-card', undefined, d.card, d.edge],
        ['m-ink', d.ink],
        ['m-muted', d.muted],
        ['m-rule', undefined, undefined, d.rule],
        ['m-link', d.link],
        ['m-btn', undefined, solid ? d.action : d.card, solid ? d.action : d.edge],
        ['m-btn a', solid ? d.onAction : d.ink],
        ['m-code', undefined, typed ? d.card : d.codeFill, typed ? d.rule : d.codeEdge],
        ['m-code span', typed ? d.ink : d.codeInk],
        ['m-band', undefined, d.band],
        ['m-band-ink', d.onBand],
        ['m-top', undefined, d.action],
        ...d.stripes.map((s, i): [string, string?, string?] => [`m-s${i}`, undefined, s])
    ];
    const css = (pre: string, parts: ('color' | 'bg' | 'border')[]) =>
        rows
            .map(([cls, color, bg, border]) => {
                const props = [
                    parts.includes('color') && color && `color:${color}!important`,
                    parts.includes('bg') && bg && `background-color:${bg}!important`,
                    parts.includes('border') && border && `border-color:${border}!important`
                ].filter(Boolean);
                const sel = cls.split(' ').map(c => (c === 'a' || c === 'span' ? c : `.${c}`));
                return props.length ? `${pre}${sel.join(' ')}{${props.join(';')}}` : '';
            })
            .join('');
    return [
        ':root{color-scheme:light dark;supported-color-schemes:light dark}',
        'body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%}',
        `@media (prefers-color-scheme:dark){${css('', ['color', 'bg', 'border'])}}`,
        // Outlook.com and the Outlook apps mark their own dark mode with these attributes.
        css('[data-ogsc] ', ['color', 'border']),
        css('[data-ogsb] ', ['bg']),
        '@media (max-width:620px){.m-pad{padding:24px 20px!important}.m-outer{padding:16px 8px!important}.m-h{font-size:26px!important;line-height:1.15!important}.m-code span{font-size:30px!important}}'
    ].join('\n');
}

/** Renders an email's content in a design. */
export function renderHtml(
    content: EmailContent,
    design: Design,
    brand: Brand,
    locale: EmailLocale
): string {
    const { light: c, dark } = palettes(design, brand);
    const f = FONTS[design.look];
    const disco = design.look === 'discotheque';
    const lang = locale === 'fr' ? 'fr-CA' : 'en-CA';
    const font = `font-family:${f.body};`;
    const linkStyle = `color:${c.link};text-decoration:underline;`;

    const rich = (r: Rich) =>
        typeof r === 'string'
            ? esc(r)
            : r
                  .map(p =>
                      typeof p === 'string'
                          ? esc(p)
                          : `<strong style="font-weight:700;">${esc(p.strong)}</strong>`
                  )
                  .join('');
    const para = (html: string, extra = '') =>
        `<p class="m-ink" style="margin:0 0 16px;${font}font-size:16px;line-height:1.55;color:${c.ink};${extra}">${html}</p>`;
    const lines = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

    const block = (b: Block): string => {
        switch (b.t) {
            case 'h':
                return `<h1 class="m-ink m-h" style="margin:0 0 16px;font-family:${f.display};font-size:${disco ? 30 : 24}px;line-height:1.15;font-weight:${disco ? 800 : 600};letter-spacing:${disco ? '-0.01em' : '0'};color:${c.ink};">${esc(b.text)}</h1>`;
            case 'p':
                return para(rich(b.text));
            case 'note':
                return `<p class="m-muted" style="margin:0 0 16px;${font}font-size:14px;line-height:1.5;color:${c.muted};">${rich(b.text)}</p>`;
            case 'sign':
                return para(esc(b.text), 'margin-top:24px;');
            case 'code': {
                const [a, z] = [b.code.slice(0, 3), b.code.slice(3)];
                const type = design.code === 'typewriter' ? TYPEWRITER : MONO;
                const digits = (s: string, gap = '') =>
                    `<span style="font-family:${type};font-size:${design.code === 'typewriter' ? 40 : 34}px;line-height:1;font-weight:700;letter-spacing:6px;color:${design.code === 'typewriter' ? c.ink : c.codeInk};${gap}">${esc(s)}</span>`;
                const box =
                    design.code === 'ticket'
                        ? `background-color:${c.codeFill};border:2px solid ${c.codeEdge};border-radius:14px;padding:16px 24px;`
                        : design.code === 'well'
                          ? `background-color:${c.codeFill};border:1px solid ${c.codeEdge};border-radius:6px;padding:16px 22px;`
                          : `border-bottom:2px dotted ${c.rule};padding:4px 2px 12px;`;
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px;"><tr><td class="m-code" bgcolor="${design.code === 'typewriter' ? c.card : c.codeFill}" style="${box}">${digits(a)}${digits(z, 'padding-left:14px;')}</td></tr></table>`;
            }
            case 'button': {
                const solid = design.button === 'solid';
                const radius = disco ? '999px' : '6px';
                const border = disco ? `2px solid ${c.edge}` : `1px solid ${c.action}`;
                const fill = solid ? c.action : c.card;
                const ink = solid ? c.onAction : c.ink;
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;"><tr><td class="m-btn" bgcolor="${fill}" style="background-color:${fill};border:${border};border-radius:${radius};mso-padding-alt:14px 28px;"><a href="${esc(b.href)}" target="_blank" style="display:inline-block;padding:14px 28px;${font}font-size:16px;line-height:1.2;font-weight:700;color:${ink};text-decoration:none;border-radius:${radius};">${esc(b.label)}</a></td></tr></table><p class="m-muted" style="margin:0 0 16px;${font}font-size:13px;line-height:1.5;color:${c.muted};">${esc(b.fallback)}<br><a class="m-link" href="${esc(b.href)}" target="_blank" style="${linkStyle}word-break:break-all;">${esc(b.href)}</a></p>`;
            }
            case 'steps':
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;">${b.items
                    .map(
                        (s, i) =>
                            `<tr><td valign="top" class="m-ink" style="width:28px;padding:0 0 12px;${font}font-size:16px;line-height:1.55;font-weight:700;color:${c.ink};">${i + 1}.</td><td valign="top" class="m-ink" style="padding:0 0 12px;${font}font-size:16px;line-height:1.55;color:${c.ink};">${esc(s.text)}${s.href ? `<br><a class="m-link" href="${esc(s.href)}" target="_blank" style="${linkStyle}font-size:14px;">${esc(s.href.replace(/^https?:\/\//, ''))}</a>` : ''}</td></tr>`
                    )
                    .join('')}</table>`;
            case 'facts':
                return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;">${b.rows
                    .map(
                        r =>
                            `<tr><td class="m-rule" style="padding:10px 0;border-top:1px ${disco ? 'dotted' : 'solid'} ${c.rule};"><p class="m-muted" style="margin:0 0 2px;${font}font-size:13px;line-height:1.4;color:${c.muted};">${esc(r.label)}</p><p class="m-ink" style="margin:0;${font}font-size:16px;line-height:1.5;color:${c.ink};">${lines(r.value)}</p></td></tr>`
                    )
                    .join('')}</table>`;
        }
    };

    const stripeRows = (width: string, height: number) =>
        `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${width}" style="width:${width.endsWith('%') ? width : width + 'px'};">${c.stripes
            .map(
                (s, i) =>
                    `<tr><td class="m-s${i}" bgcolor="${s}" height="${height}" style="height:${height}px;line-height:${height}px;font-size:0;background-color:${s};">&nbsp;</td></tr>`
            )
            .join('')}</table>`;

    const name = content.sender?.name ?? brand.productName;
    const logo = !content.sender && brand.logo;
    const wordmark = logo
        ? `<img src="${esc(logo.src)}" width="${logo.width}" alt="${esc(brand.productName)}" style="display:block;width:${logo.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`
        : `<span class="m-ink" style="font-family:${f.display};font-size:${disco ? 24 : 17}px;line-height:1.2;font-weight:${disco ? 800 : 600};letter-spacing:${disco ? '-0.01em' : '0'};color:${c.ink};">${esc(name)}</span>`;

    let header: string;
    if (design.header === 'band') {
        const bandName = logo
            ? wordmark
            : `<span class="m-band-ink" style="font-family:${f.display};font-size:26px;line-height:1.2;font-weight:800;color:${c.onBand};">${esc(name)}</span>`;
        header = `<tr><td class="m-band" bgcolor="${c.band}" style="background-color:${c.band};padding:20px 32px;border-radius:22px 22px 0 0;">${bandName}</td></tr>${design.stripes === 'band' && !content.sender ? `<tr><td>${stripeRows('100%', 6)}</td></tr>` : ''}`;
    } else {
        const mark =
            design.stripes === 'mark' && !content.sender && !logo
                ? `<td valign="middle" style="padding-right:10px;">${stripeRows('22', 4)}</td>`
                : '';
        header = `<tr><td style="padding:0 4px 16px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${mark}<td valign="middle">${wordmark}</td></tr></table></td></tr>`;
    }

    const body = content.blocks.map(block).join('');
    const card = design.frame === 'card';
    const banded = design.header === 'band';
    const cardStyle = card
        ? `background-color:${c.card};border:${disco ? `2px solid ${c.edge}` : `1px solid ${c.edge}`};border-radius:${banded ? '0 0 22px 22px' : disco ? '22px' : '8px'};${banded ? 'border-top:0;' : ''}`
        : `background-color:${c.card};`;
    const topLine = design.topLine
        ? `<tr><td class="m-top" bgcolor="${c.action}" height="4" style="height:4px;line-height:4px;font-size:0;background-color:${c.action};border-radius:8px 8px 0 0;">&nbsp;</td></tr>`
        : '';
    const main = `${topLine}<tr><td class="m-card${card ? ' m-pad' : ''}" bgcolor="${c.card}" style="${cardStyle}padding:${card ? '32px' : '8px 4px 16px'};${design.topLine ? 'border-top:0;border-radius:0 0 8px 8px;' : ''}">${body}</td></tr>`;

    const foot: string[] = [];
    if (content.why) foot.push(rich(content.why));
    if (content.unsubscribe)
        foot.push(
            `<a class="m-muted" href="${esc(content.unsubscribe.href)}" target="_blank" style="color:${c.muted};text-decoration:underline;">${esc(content.unsubscribe.label)}</a>`
        );
    if (!content.sender && brand.supportUrl)
        foot.push(
            `<a class="m-muted" href="${esc(brand.supportUrl)}" target="_blank" style="color:${c.muted};text-decoration:underline;">${esc(brand.supportUrl.replace(/^https:\/\//, '').replace(/\/$/, ''))}</a>`
        );
    if (!content.sender && brand.footer) foot.push(lines(brand.footer));
    const footer = foot.length
        ? `<tr><td class="m-muted m-rule" style="padding:${card ? '20px 4px 0' : `16px 4px 0;border-top:1px ${disco ? 'dotted' : 'solid'} ${c.rule}`};${font}font-size:13px;line-height:1.5;color:${c.muted};">${foot.map(p => `<p class="m-muted" style="margin:0 0 8px;color:${c.muted};">${p}</p>`).join('')}</td></tr>`
        : '';
    const footStripes =
        design.stripes === 'foot' && !content.sender
            ? `<tr><td style="padding:20px 4px 0;">${stripeRows('100%', 4)}</td></tr>`
            : '';

    const pre = `<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;opacity:0;color:${c.ground};">${esc(content.preheader)}${'&#8199;&#65279;&#847; '.repeat(24)}</div>`;

    return `<!DOCTYPE html>
<html lang="${lang}" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(content.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,span{font-family:Arial,sans-serif!important}h1{font-family:${disco ? 'Georgia,serif' : 'Arial,sans-serif'}!important}.m-code span{font-family:'Courier New',monospace!important}</style><![endif]-->
<style>
${styles(design, dark)}
</style>
</head>
<body class="m-ground" style="margin:0;padding:0;background-color:${c.ground};">
${pre}
<table role="presentation" class="m-ground" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${c.ground}" style="background-color:${c.ground};">
<tr><td class="m-outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
${header}
${main}
${footer}
${footStripes}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}

/** The plain-text part: the same words, in reading order, every address written out. */
export function renderText(content: EmailContent, brand: Brand, locale: EmailLocale): string {
    const colon = locale === 'fr' ? '\u202f:' : ':';
    if (content.text !== undefined) return content.text;
    const out: string[] = [];
    for (const b of content.blocks) {
        switch (b.t) {
            case 'h':
            case 'sign':
                out.push(b.text);
                break;
            case 'p':
            case 'note':
                out.push(plain(b.text));
                break;
            case 'code':
                out.push(`    ${b.code.slice(0, 3)} ${b.code.slice(3)}`);
                break;
            case 'button': {
                // After a sentence that already leads to it, the address alone.
                const led = /:$/.test(out[out.length - 1] ?? '');
                out.push(led ? b.href : `${b.label}${colon}\n${b.href}`);
                break;
            }
            case 'steps':
                out.push(
                    b.items
                        .map((s, i) => `${i + 1}. ${s.text}${s.href ? `\n   ${s.href}` : ''}`)
                        .join('\n')
                );
                break;
            case 'facts':
                out.push(b.rows.map(r => `${r.label}${colon}\n${r.value}`).join('\n\n'));
                break;
        }
    }
    const foot: string[] = [];
    if (content.why) foot.push(plain(content.why));
    if (content.unsubscribe)
        foot.push(`${content.unsubscribe.label}${colon}\n${content.unsubscribe.href}`);
    if (!content.sender && brand.supportUrl) foot.push(brand.supportUrl);
    if (!content.sender && brand.footer) foot.push(brand.footer);
    return [...out, ...foot].join('\n\n') + '\n';
}

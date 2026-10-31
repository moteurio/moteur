import { forDark, textOn } from './colour.js';
import type { EmailLocale, EmailLook } from './settings.js';

/**
 * One layout for every email the engine sends: small, table-based and inline-styled, so it reads
 * the same in Gmail, Outlook (its Word engine too), Apple Mail and phones. No web fonts, no
 * remote images unless the operator set a logo URL, no tracking. A `<style>` block only adds a
 * dark palette and phone padding; without it the email is still whole.
 */

/** A part of a line: plain, in bold, or a link (shown as `text`, written out in the plain text). */
export type RichPart = string | { strong: string } | { href: string; text: string };
/** Text with some parts in bold or linked. */
export type Rich = string | RichPart[];

export type Block =
    | { t: 'h'; text: string }
    /** A smaller heading, inside a panel or over a section. */
    | { t: 'h2'; text: string }
    /** A short label over the heading: what kind of email this is. */
    | { t: 'kicker'; text: string }
    | { t: 'p'; text: Rich }
    /** A one-time code: shown spaced, copied without the space. */
    | { t: 'code'; code: string }
    /** The one action. `fallback` introduces the bare address for when the button can't be pressed. */
    | { t: 'button'; label: string; href: string; fallback: string }
    | { t: 'steps'; items: { text: string; href?: string }[] }
    /** Short points, in no order. */
    | { t: 'list'; items: Rich[] }
    /** Labels over values, one under the other (answers to a form). */
    | { t: 'facts'; rows: { label: string; value: string }[] }
    /** Labels beside values (a role, a date). */
    | { t: 'pairs'; rows: { label: string; value: Rich }[] }
    /** A person, with their initials in a circle (never a remote picture). */
    | { t: 'person'; name: string; detail?: string; label?: string }
    /** Someone's own words, set apart: an inviter's note. */
    | { t: 'quote'; label: string; text: string }
    /** A tinted box holding other blocks: the project someone is invited to. */
    | { t: 'panel'; blocks: Block[] }
    /** A quiet section under a rule: what the product is, where help is. */
    | { t: 'about'; title: string; text: Rich }
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

/**
 * How a look sets an email. Discothèque is Marquee: the Studio's chocolate band with the name and
 * the four stripes, the code on a mustard ticket, a pill button. Folio is Tab: a white card with a
 * line of accent along its top, the code in a grey well.
 */
export interface Design {
    id: string;
    look: EmailLook;
    name: string;
}

export const DESIGNS: Design[] = [
    { id: 'disco-marquee', look: 'discotheque', name: 'Marquee' },
    { id: 'folio-tab', look: 'folio', name: 'Tab' }
];

export function designFor(look: EmailLook): Design {
    return DESIGNS.find(d => d.look === look)!;
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
    /** A tinted box inside the card, and its outline. */
    panel: string;
    panelEdge: string;
    /** The circle behind a person's initials, and the initials. */
    avatar: string;
    onAvatar: string;
    /** The rule beside a quoted note. */
    quote: string;
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
            panel: '#FBEFD6',
            panelEdge: '#3B2416',
            avatar: '#E1A730',
            onAvatar: '#3B2416',
            quote: '#D9622B',
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
            panel: '#33200F',
            panelEdge: '#C9B28A',
            avatar: '#E1A730',
            onAvatar: '#3B2416',
            quote: '#E57A47',
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
            panel: '#F0F3F7',
            panelEdge: '#DDE1E6',
            avatar: '#E8F0FC',
            onAvatar: '#1C56B3',
            quote: '#1F5FC4',
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
            panel: '#222830',
            panelEdge: '#2C333C',
            avatar: '#17253B',
            onAvatar: '#8DB4F5',
            quote: '#6EA0F2',
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

export const esc = (s: string) =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/** Plain text of a line: links written out in full, so the text part has every address. */
const plain = (r: Rich): string =>
    typeof r === 'string'
        ? r
        : r.map(p => (typeof p === 'string' ? p : 'strong' in p ? p.strong : p.href)).join('');

/** Up to two initials, for a person's circle. */
export function initials(name: string): string {
    const words = name
        .replace(/@.*/, '')
        .split(/[\s._-]+/)
        .filter(w => /\p{L}/u.test(w));
    const first = (w?: string) => (w ? ([...w.replace(/^\P{L}+/u, '')][0] ?? '') : '');
    const two =
        words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0]);
    return (two || '?').toLocaleUpperCase();
}

function palettes(brand: Brand, look: EmailLook): { light: Palette; dark: Palette } {
    const light = { ...PALETTES[look].light };
    const dark = { ...PALETTES[look].dark };
    if (brand.accent) {
        light.action = brand.accent;
        light.onAction = '#FFFFFF';
        light.link = brand.accent;
        light.quote = brand.accent;
        dark.action = forDark(brand.accent, dark.card);
        dark.onAction = textOn(dark.action, dark.ground);
        dark.link = forDark(brand.accent, dark.card);
        dark.quote = dark.action;
    }
    return { light, dark };
}

/** The `<style>` block: dark palette (Apple Mail, iOS, Outlook.com), phone padding. */
function styles(d: Palette): string {
    // [class, colour, background, border]: one list, written for each client's dark mode.
    const rows: [string, string?, string?, string?][] = [
        ['m-ground', undefined, d.ground],
        ['m-card', undefined, d.card, d.edge],
        ['m-ink', d.ink],
        ['m-muted', d.muted],
        ['m-rule', undefined, undefined, d.rule],
        ['m-link', d.link],
        ['m-btn', undefined, d.action, d.action],
        ['m-btn a', d.onAction],
        ['m-code', undefined, d.codeFill, d.codeEdge],
        ['m-code span', d.codeInk],
        ['m-band', undefined, d.band],
        ['m-band-ink', d.onBand],
        ['m-top', undefined, d.action],
        ['m-panel', undefined, d.panel, d.panelEdge],
        ['m-av', d.onAvatar, d.avatar],
        ['m-quote', undefined, undefined, d.quote],
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
        '@media (max-width:620px){.m-pad{padding:24px 20px!important}.m-outer{padding:16px 8px!important}.m-h{font-size:26px!important;line-height:1.15!important}.m-code span{font-size:30px!important}.m-ppad{padding:16px 16px 4px!important}.m-lab{width:92px!important}}'
    ].join('\n');
}

/** Renders an email's content in a look's design. */
export function renderHtml(
    content: EmailContent,
    design: Design,
    brand: Brand,
    locale: EmailLocale
): string {
    const { light: c, dark } = palettes(brand, design.look);
    const f = FONTS[design.look];
    const disco = design.look === 'discotheque';
    const lang = locale === 'fr' ? 'fr-CA' : 'en-CA';
    const font = `font-family:${f.body};`;
    const linkStyle = `color:${c.link};text-decoration:underline;`;
    const dotted = disco ? 'dotted' : 'solid';

    const rich = (r: Rich) =>
        typeof r === 'string'
            ? esc(r)
            : r
                  .map(p =>
                      typeof p === 'string'
                          ? esc(p)
                          : 'strong' in p
                            ? `<strong style="font-weight:700;">${esc(p.strong)}</strong>`
                            : `<a class="m-link" href="${esc(p.href)}" target="_blank" style="${linkStyle}">${esc(p.text)}</a>`
                  )
                  .join('');
    const para = (html: string, extra = '') =>
        `<p class="m-ink" style="margin:0 0 16px;${font}font-size:16px;line-height:1.55;color:${c.ink};${extra}">${html}</p>`;
    const lines = (s: string) => esc(s).replace(/\r?\n/g, '<br>');
    const table = (inner: string, style = 'margin:0 0 16px;', full = true) =>
        `<table role="presentation" cellspacing="0" cellpadding="0" border="0"${full ? ' width="100%"' : ''} style="${style}">${inner}</table>`;
    const label = (text: string, extra = '') =>
        `<p class="m-muted" style="margin:0 0 6px;${font}font-size:${disco ? 12 : 13}px;line-height:1.4;font-weight:700;${disco ? 'letter-spacing:0.12em;text-transform:uppercase;' : ''}color:${c.muted};${extra}">${esc(text)}</p>`;
    const rule = (i: number) => (i ? `border-top:1px ${dotted} ${c.rule};` : '');

    const block = (b: Block): string => {
        switch (b.t) {
            case 'h':
                return `<h1 class="m-ink m-h" style="margin:0 0 16px;font-family:${f.display};font-size:${disco ? 30 : 24}px;line-height:1.15;font-weight:${disco ? 800 : 600};letter-spacing:${disco ? '-0.01em' : '0'};color:${c.ink};">${esc(b.text)}</h1>`;
            case 'h2':
                return `<h2 class="m-ink" style="margin:0 0 8px;font-family:${f.display};font-size:${disco ? 22 : 18}px;line-height:1.2;font-weight:${disco ? 800 : 600};color:${c.ink};">${esc(b.text)}</h2>`;
            case 'kicker':
                return label(b.text, 'margin:0 0 10px;');
            case 'p':
                return para(rich(b.text));
            case 'note':
                return `<p class="m-muted" style="margin:0 0 16px;${font}font-size:14px;line-height:1.5;color:${c.muted};">${rich(b.text)}</p>`;
            case 'sign':
                return para(esc(b.text), 'margin-top:24px;');
            case 'code': {
                const [a, z] = [b.code.slice(0, 3), b.code.slice(3)];
                const digits = (s: string, gap = '') =>
                    `<span style="font-family:${MONO};font-size:34px;line-height:1;font-weight:700;letter-spacing:6px;color:${c.codeInk};${gap}">${esc(s)}</span>`;
                const box = disco
                    ? `background-color:${c.codeFill};border:2px solid ${c.codeEdge};border-radius:14px;padding:16px 24px;`
                    : `background-color:${c.codeFill};border:1px solid ${c.codeEdge};border-radius:6px;padding:16px 22px;`;
                return table(
                    `<tr><td class="m-code" bgcolor="${c.codeFill}" style="${box}">${digits(a)}${digits(z, 'padding-left:14px;')}</td></tr>`,
                    'margin:4px 0 20px;',
                    false
                );
            }
            case 'button': {
                const radius = disco ? '999px' : '6px';
                const border = disco ? `2px solid ${c.edge}` : `1px solid ${c.action}`;
                return `${table(
                    `<tr><td class="m-btn" bgcolor="${c.action}" style="background-color:${c.action};border:${border};border-radius:${radius};mso-padding-alt:14px 28px;"><a href="${esc(b.href)}" target="_blank" style="display:inline-block;padding:14px 28px;${font}font-size:16px;line-height:1.2;font-weight:700;color:${c.onAction};text-decoration:none;border-radius:${radius};">${esc(b.label)}</a></td></tr>`,
                    'margin:8px 0 20px;',
                    false
                )}<p class="m-muted" style="margin:0 0 16px;${font}font-size:13px;line-height:1.5;color:${c.muted};">${esc(b.fallback)}<br><a class="m-link" href="${esc(b.href)}" target="_blank" style="${linkStyle}word-break:break-all;">${esc(b.href)}</a></p>`;
            }
            case 'steps':
                return table(
                    b.items
                        .map(
                            (s, i) =>
                                `<tr><td valign="top" class="m-ink" style="width:28px;padding:0 0 12px;${font}font-size:16px;line-height:1.55;font-weight:700;color:${c.ink};">${i + 1}.</td><td valign="top" class="m-ink" style="padding:0 0 12px;${font}font-size:16px;line-height:1.55;color:${c.ink};">${esc(s.text)}${s.href ? `<br><a class="m-link" href="${esc(s.href)}" target="_blank" style="${linkStyle}font-size:14px;">${esc(s.href.replace(/^https?:\/\//, ''))}</a>` : ''}</td></tr>`
                        )
                        .join('')
                );
            case 'list':
                return table(
                    b.items
                        .map(
                            s =>
                                `<tr><td valign="top" class="m-ink" style="width:20px;padding:0 0 10px;${font}font-size:16px;line-height:1.55;font-weight:700;color:${c.ink};">&bull;</td><td valign="top" class="m-ink" style="padding:0 0 10px;${font}font-size:16px;line-height:1.55;color:${c.ink};">${rich(s)}</td></tr>`
                        )
                        .join('')
                );
            case 'facts':
                return table(
                    b.rows
                        .map(
                            r =>
                                `<tr><td class="m-rule" style="padding:10px 0;border-top:1px ${dotted} ${c.rule};"><p class="m-muted" style="margin:0 0 2px;${font}font-size:13px;line-height:1.4;color:${c.muted};">${esc(r.label)}</p><p class="m-ink" style="margin:0;${font}font-size:16px;line-height:1.5;color:${c.ink};overflow-wrap:anywhere;">${lines(r.value)}</p></td></tr>`
                        )
                        .join('')
                );
            case 'pairs':
                return table(
                    b.rows
                        .map(
                            (r, i) =>
                                `<tr><td valign="top" class="m-muted m-rule m-lab" style="width:120px;padding:10px 12px 10px 0;${rule(i)}${font}font-size:14px;line-height:1.5;color:${c.muted};">${esc(r.label)}</td><td valign="top" class="m-ink m-rule" style="padding:10px 0;${rule(i)}${font}font-size:15px;line-height:1.5;color:${c.ink};">${rich(r.value)}</td></tr>`
                        )
                        .join('')
                );
            case 'person': {
                const size = 44;
                const circle = `<td valign="middle" width="${size + 14}" style="width:${size + 14}px;">${table(
                    `<tr><td class="m-av" align="center" valign="middle" bgcolor="${c.avatar}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;background-color:${c.avatar};${disco ? `border:2px solid ${c.edge};` : ''}${font}font-size:16px;line-height:${size}px;font-weight:700;color:${c.onAvatar};">${esc(initials(b.name))}</td></tr>`,
                    '',
                    false
                )}</td>`;
                const who = `<td valign="middle">${b.label ? label(b.label, 'margin:0 0 2px;') : ''}<p class="m-ink" style="margin:0;${font}font-size:16px;line-height:1.4;font-weight:700;color:${c.ink};">${esc(b.name)}</p>${b.detail ? `<p class="m-muted" style="margin:0;${font}font-size:14px;line-height:1.4;color:${c.muted};overflow-wrap:anywhere;">${esc(b.detail)}</p>` : ''}</td>`;
                return table(`<tr>${circle}${who}</tr>`, 'margin:0 0 18px;');
            }
            case 'quote':
                return `${label(b.label)}${table(
                    `<tr><td class="m-quote m-ink" style="border-left:${disco ? 4 : 3}px solid ${c.quote};padding:2px 0 2px 16px;${font}font-size:16px;line-height:1.55;font-style:italic;color:${c.ink};overflow-wrap:anywhere;">${lines(b.text)}</td></tr>`,
                    'margin:0 0 20px;'
                )}`;
            case 'panel':
                return table(
                    `<tr><td class="m-panel m-ppad" bgcolor="${c.panel}" style="background-color:${c.panel};border:${disco ? 2 : 1}px solid ${c.panelEdge};border-radius:${disco ? 14 : 6}px;padding:20px 22px 6px;">${b.blocks.map(block).join('')}</td></tr>`,
                    'margin:4px 0 20px;'
                );
            case 'about':
                return table(
                    `<tr><td class="m-rule" style="border-top:${disco ? 2 : 1}px ${dotted} ${c.rule};padding-top:18px;">${label(b.title)}<p class="m-muted" style="margin:0 0 8px;${font}font-size:15px;line-height:1.55;color:${c.muted};">${rich(b.text)}</p></td></tr>`,
                    'margin:8px 0;'
                );
        }
    };

    const stripeRows = (height: number) =>
        table(
            c.stripes
                .map(
                    (s, i) =>
                        `<tr><td class="m-s${i}" bgcolor="${s}" height="${height}" style="height:${height}px;line-height:${height}px;font-size:0;background-color:${s};">&nbsp;</td></tr>`
                )
                .join(''),
            'width:100%;'
        );

    const name = content.sender?.name ?? brand.productName;
    const logo = !content.sender && brand.logo;
    const logoImg = logo
        ? `<img src="${esc(logo.src)}" width="${logo.width}" alt="${esc(brand.productName)}" style="display:block;width:${logo.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">`
        : '';

    let header: string;
    if (disco) {
        // Marquee: the name on the chocolate band, the four stripes under it.
        const bandName =
            logoImg ||
            `<span class="m-band-ink" style="font-family:${f.display};font-size:26px;line-height:1.2;font-weight:800;color:${c.onBand};">${esc(name)}</span>`;
        header = `<tr><td class="m-band" bgcolor="${c.band}" style="background-color:${c.band};padding:20px 32px;border-radius:22px 22px 0 0;">${bandName}</td></tr>${content.sender ? '' : `<tr><td>${stripeRows(6)}</td></tr>`}`;
    } else {
        const wordmark =
            logoImg ||
            `<span class="m-ink" style="font-family:${f.display};font-size:17px;line-height:1.2;font-weight:600;color:${c.ink};">${esc(name)}</span>`;
        header = `<tr><td style="padding:0 4px 16px;">${wordmark}</td></tr>`;
    }

    const body = content.blocks.map(block).join('');
    // Tab: a line of accent along the top of the card.
    const topLine = disco
        ? ''
        : `<tr><td class="m-top" bgcolor="${c.action}" height="4" style="height:4px;line-height:4px;font-size:0;background-color:${c.action};border-radius:8px 8px 0 0;">&nbsp;</td></tr>`;
    const cardStyle = disco
        ? `background-color:${c.card};border:2px solid ${c.edge};border-top:0;border-radius:0 0 22px 22px;`
        : `background-color:${c.card};border:1px solid ${c.edge};border-top:0;border-radius:0 0 8px 8px;`;
    const main = `${topLine}<tr><td class="m-card m-pad" bgcolor="${c.card}" style="${cardStyle}padding:32px;">${body}</td></tr>`;

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
        ? `<tr><td class="m-muted" style="padding:20px 4px 0;${font}font-size:13px;line-height:1.5;color:${c.muted};">${foot.map(p => `<p class="m-muted" style="margin:0 0 8px;color:${c.muted};">${p}</p>`).join('')}</td></tr>`
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
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,span{font-family:Arial,sans-serif!important}h1,h2{font-family:${disco ? 'Georgia,serif' : 'Arial,sans-serif'}!important}.m-code span{font-family:'Courier New',monospace!important}</style><![endif]-->
<style>
${styles(dark)}
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
    const colon = locale === 'fr' ? ' :' : ':';
    if (content.text !== undefined) return content.text;
    const out: string[] = [];
    const walk = (blocks: Block[]) => {
        for (const b of blocks) {
            switch (b.t) {
                case 'h':
                case 'h2':
                case 'kicker':
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
                case 'list':
                    out.push(b.items.map(s => `• ${plain(s)}`).join('\n'));
                    break;
                case 'facts':
                    out.push(b.rows.map(r => `${r.label}${colon}\n${r.value}`).join('\n\n'));
                    break;
                case 'pairs':
                    out.push(b.rows.map(r => `${r.label}${colon} ${plain(r.value)}`).join('\n'));
                    break;
                case 'person':
                    out.push(
                        `${b.label ? `${b.label}\n` : ''}${b.name}${b.detail ? ` · ${b.detail}` : ''}`
                    );
                    break;
                case 'quote':
                    out.push(
                        `${b.label}\n${b.text
                            .split(/\r?\n/)
                            .map(l => `> ${l}`)
                            .join('\n')}`
                    );
                    break;
                case 'panel':
                    walk(b.blocks);
                    break;
                case 'about':
                    out.push(`${b.title}\n${plain(b.text)}`);
                    break;
            }
        }
    };
    walk(content.blocks);
    const foot: string[] = [];
    if (content.why) foot.push(plain(content.why));
    if (content.unsubscribe)
        foot.push(`${content.unsubscribe.label}${colon}\n${content.unsubscribe.href}`);
    if (!content.sender && brand.supportUrl) foot.push(brand.supportUrl);
    if (!content.sender && brand.footer) foot.push(brand.footer);
    return [...out, ...foot].join('\n\n') + '\n';
}

/**
 * Moteur Journal — AI image generation prompts (Flux / DALL·E / fal).
 * Each entry in ART_IMAGE_PROMPTS_COMPLETE is a single copy-paste prompt including
 * style bible, palette, subject, aspect ratio, and negative prompt.
 *
 * Typography (mastheads, issue numbers, poster dates) stays SVG overlay — illustration only.
 */

import type { PaletteName } from '../art/svg.js';
import { SERIES, ROBOT_INFO } from './content/catalogue.js';
import { AUTHOR_ART } from './content/art-info.js';
import { ISSUES } from './content/issues.js';
import { EVENTS } from './content/events.js';

export const RECOMMENDED_GENERATOR = {
    provider: 'fal' as const,
    model: 'flux-pro',
    fallback: { provider: 'openai' as const, model: 'dall-e-3' },
    styleHints: ['illustration', 'editorial'] as const
};

export const STYLE_BIBLE = `1970s Canadian editorial screen-print illustration for Moteur Industries, a fictional Montréal robotics company (1968–1978).
Flat geometric shapes, bold black ink outlines, limited spot colors, halftone dot texture on aged warm paper.
Mid-century industrial design catalogue and magazine art direction; sincere corporate modernism.
Not photorealistic, not 3D render, not CGI, not anime, not neon cyberpunk, not glossy mecha.
Montreal winter light and North American print culture. Subtle paper grain and registration imperfections welcome.`;

export const NEGATIVE_PROMPT = `photorealistic, CGI, octane render, unreal engine, glossy plastic, chrome robot, mecha, anime, chibi,
lens flare, bokeh, stock photo, hyperreal skin, gradient mesh, 4k hyperdetail, cluttered composition,
text, typography, letters, numbers, words, logo, watermark, signature, caption, UI, border with writing,
celebrity likeness, identifiable real person`;

const PALETTE: Record<PaletteName, string> = {
    maison: 'Colors only: warm cream paper #efe3cc, ink #2b1d14, orange #d8622b, gold #e9b44c, shadow #9b4a22.',
    industrie:
        'Colors only: cool grey paper #e4e6e1, ink #1c2229, steel blue #2f5d8a, yellow #f2c230, shadow #5b6b78.',
    compagnon:
        'Colors only: sage paper #e8eadf, ink #17251f, teal #2f8a6e, coral #e07a5f, shadow #3d5a50.',
    horizon:
        'Colors only: pale blue-grey paper #dfe7ec, ink #0d1b2a, navy #1b4965, sky blue #5fa8d3, shadow #62b6cb.',
    signal: 'Colors only: warm grey paper #f1e9e2, ink #1a1a1a, red #c0392b, slate #2c3e50, shadow #7f8c8d.',
    archive:
        'Colors only: aged tan paper #eadfc8, ink #3b2f22, brown #8a6a43, sand #b8956a, shadow #6d5a44.'
};

export type ArtPromptCategory =
    | 'brand'
    | 'cover-illustration'
    | 'series'
    | 'robot'
    | 'author'
    | 'article-scene'
    | 'chart'
    | 'event-poster-illustration';

export type AspectRatio = '1:1' | '3:4' | '16:10' | '4:3';

export interface ArtImagePromptSpec {
    key: string;
    category: ArtPromptCategory;
    aspectRatio: AspectRatio;
    folder: string;
    palette: PaletteName;
    /** Illustration subject (style bible and negative are appended by assemblePrompt). */
    subject: string;
    overlayNote?: string;
}

export function assemblePrompt(
    spec: Pick<ArtImagePromptSpec, 'subject' | 'palette' | 'aspectRatio'>
): string {
    return [
        STYLE_BIBLE,
        PALETTE[spec.palette],
        `Aspect ratio: ${spec.aspectRatio}.`,
        spec.subject.trim(),
        `Negative prompt: ${NEGATIVE_PROMPT}`
    ].join('\n\n');
}

const COVER_MOTIF_SUBJECT: Record<string, string> = {
    zero: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: withdrawn pilot issue — diagonal ruled lines over a large serif zero shape on cream paper, mimeograph energy, withdrawn proof aesthetic.
Top 25% calmer paper for future masthead overlay; bottom 110px dark ink band empty for footer type.`,
    dawn: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: winter dawn — sun disk half below horizon, radiating lines, small garage silhouette, first light over Montréal.
Top 25% simpler for masthead overlay; bottom dark ink band empty for bilingual footer.`,
    home: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: the home — geometric house with warm windows, domestic MAISON robot implied near doorway, spring feeling.
Lower two-thirds weighted; top calm for masthead; bottom ink band empty.`,
    factory: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: factory at night — sawtooth roofline, smokestacks, yellow window grids, industrial robot arms as simple silhouettes, 3 a.m. brightness.
Bottom ink band empty for footer type.`,
    bond: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: human–machine bond — two overlapping circles (human silhouette and robot head silhouette), warm attachment, waiting-list melancholy.
Compagnon series emotional tone; bottom ink band empty.`,
    edge: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: the edge — ocean horizon lines, small deep-sea submersible, moon, final-issue farewell mood.
Horizon series palette; top and bottom safe zones for typography overlay.`,
    signal: `Magazine cover ILLUSTRATION PLATE ONLY (no masthead, no titles).
Motif: radio signal — central antenna mast, concentric broadcast arcs, Sept-Îles coastal mood, who is listening.
Special issue energy; strong vertical center; bottom band empty.`
};

const SCENE_SUBJECT: Record<string, { kind: string; palette: PaletteName; subject: string }> = {
    'scene-garage': {
        kind: 'garage',
        palette: 'maison',
        subject: `Wide editorial illustration: Rue Saint-Denis garage workshop, winter 1968, snow outside open door,
geometric robot under construction on blocks, warm interior orange spot color, founders' startup mood, horizontal 16:10 composition with breathing room.`
    },
    'scene-skyline': {
        kind: 'skyline',
        palette: 'maison',
        subject: `Wide editorial illustration: Montréal skyline from the harbour, blocky buildings, cross on Mount Royal, grain elevator,
1970s port industry, flat shapes, pale sun disk, horizontal composition.`
    },
    'scene-skyline-dusk': {
        kind: 'skyline',
        palette: 'signal',
        subject: `Wide editorial illustration: Montréal at dusk, deep slate sky, red accent windows, silhouette skyline,
quiet urban evening, SIGNAL special-issue tension, horizontal 16:10.`
    },
    'scene-factory': {
        kind: 'factory',
        palette: 'industrie',
        subject: `Wide editorial illustration: Rouyn-Noranda plant at 3 a.m., rows of yellow industrial lamps,
six-axis robot arms as bold geometric forms, never-sleeping factory, horizontal composition, high contrast ink and blue.`
    },
    'scene-factory-lachine': {
        kind: 'factory',
        palette: 'maison',
        subject: `Wide editorial illustration: Lachine MAISON assembly line, domestic robots on conveyor implied as simple shapes,
factory open-house friendly tone, orange and cream palette, horizontal 16:10.`
    },
    'scene-ocean': {
        kind: 'ocean',
        palette: 'horizon',
        subject: `Wide editorial illustration: HORIZON-E deep submersible at 3847 metres, layered navy waves, small heroic robot vessel,
North Atlantic exploration, horizontal composition, depth suggested by flat wave bands.`
    },
    'scene-ocean-north': {
        kind: 'ocean',
        palette: 'compagnon',
        subject: `Wide editorial illustration: under sea ice, Ungava Bay, HORIZON-N expedition, teal ice ceiling, coral accents,
remote northern winter, horizontal 16:10, lonely exploration mood.`
    },
    'scene-blueprint-la-chose': {
        kind: 'blueprint',
        palette: 'horizon',
        subject: `Technical blueprint plate: LA CHOSE prototype 1968, cyanotype blue background, white line art,
top-down robot schematic, dimension ticks without readable numbers, engineering sheet 1:4 scale feel, landscape 16:10.
MOTEUR INDUSTRIES header area left blank (no text).`
    },
    'scene-blueprint-arm': {
        kind: 'blueprint',
        palette: 'industrie',
        subject: `Technical blueprint plate: INDUSTRIE-F six-axis arm, white lines on deep blue, joint circles and reach arc,
industrial precision mood, landscape 16:10, no readable labels.`
    },
    'scene-blueprint-signal': {
        kind: 'blueprint',
        palette: 'signal',
        subject: `Technical blueprint plate: SIGNAL-1 antenna and relay schematic, white on blue-grey, concentric radiation lobes,
communications engineering, landscape 16:10, no text.`
    }
};

/** Visual direction per robot id — derived from catalogue copy. */
const ROBOT_SUBJECT: Record<string, string> = {
    'la-chose': `Product portrait: LA CHOSE prototype (1968), bulky first robot 92 kg energy, boxy head twin eyes, coffee-tray arms, garage-built honesty, archive brown palette, square 1:1, bottom dark band empty for name overlay.`,
    'maison-1': `Product portrait: MAISON-1 (1970), first kitchen domestic unit, shorter rounded body, simple twin eyes, no memory era, homemaker appliance personality, square 1:1, bottom band empty.`,
    'maison-2': `Product portrait: MAISON-2 (1972), laundry-learning domestic robot, apron-shaped chest panel, twin eyes, discontinued vintage, square 1:1.`,
    'maison-3': `Product portrait: MAISON-3 (1975), contextual memory domestic robot, warm friendly geometric face, chest gauge dots, orange colorway, bestselling home unit, square 1:1, bottom band empty.`,
    'maison-3-blanche': `Product portrait: MAISON-3 white limited edition (1976), cream and paper-toned body, same silhouette as MAISON-3, premium domestic, square 1:1.`,
    'maison-5': `Product portrait: MAISON-5 (1977), taller apartment-sized domestic unit, wider shoulders, patient calm posture, square 1:1.`,
    'maison-7': `Product portrait: MAISON-7 (1978), lighter patient domestic line, slim torso, waitlist era, square 1:1.`,
    'maison-9': `Product portrait: MAISON-9 prototype (1979), experimental domestic, slightly unfinished panels, trial-family mood, square 1:1.`,
    'industrie-a': `Product portrait: INDUSTRIE-A (1971), single heavy industrial arm mounted on pedestal, one task one arm, factory yellow and blue, square 1:1.`,
    'industrie-b': `Product portrait: INDUSTRIE-B (1972), dual-arm industrial unit, symmetrical arms, no breaks mood, square 1:1.`,
    'industrie-c': `Product portrait: INDUSTRIE-C (1975), food-processing industrial robot, cleanable flat panels, hygienic factory design, square 1:1.`,
    'industrie-f': `Product portrait: INDUSTRIE-F (1974), six-axis factory arm, precision joints as circles, best-seller industrial icon, cold-rated rugged mood, square 1:1.`,
    'industrie-f2': `Product portrait: INDUSTRIE-F2 (1978), quieter revision of INDUSTRIE-F, same arm geometry, softer shadow shapes, square 1:1.`,
    'industrie-m': `Product portrait: INDUSTRIE-M (1976), mining robot for Abitibi, reinforced tread base, headlamp visor, rugged square 1:1.`,
    'industrie-n': `Product portrait: INDUSTRIE-N (1977), shipyard robot, gantry hook shoulder, maritime industrial, square 1:1.`,
    'industrie-x': `Product portrait: INDUSTRIE-X (1977) classified, silhouette mostly redacted black bars over robot form, confidential document aesthetic, square 1:1.`,
    'compagnon-1': `Product portrait: COMPAGNON-1 (1969), original companion unit, gentle dome head, warm voice era, obituary-ready dignity, square 1:1.`,
    'compagnon-2': `Product portrait: COMPAGNON-2 (1970), storytelling companion, speaker grille chest, twin eyes, square 1:1.`,
    'compagnon-4': `Product portrait: COMPAGNON-4 (1973), voice turns warm, rounded head, soft antenna, emotional companion design, square 1:1.`,
    'compagnon-6': `Product portrait: COMPAGNON-6 (1975), off-key singer companion, musical note motif on chest (abstract shapes only), square 1:1.`,
    'compagnon-9': `Product portrait: COMPAGNON-9 (1977), waitlist icon, heart-series green, approachable companion face, warranty prestige, square 1:1.`,
    'compagnon-9-junior': `Product portrait: COMPAGNON-9 Junior (1978), smaller child-scale companion, same design language shorter, square 1:1.`,
    'compagnon-9-sport': `Product portrait: COMPAGNON-9 Sport (1978), marathon runner companion, lean legs, athletic posture, square 1:1.`,
    'compagnon-10': `Product portrait: COMPAGNON-10 prototype (1979), spring announcement teaser, partially revealed silhouette, square 1:1.`,
    'horizon-a': `Product portrait: HORIZON-A (1975), first deep diver below 1000m, compact pressure hull head, square 1:1.`,
    'horizon-e': `Product portrait: HORIZON-E (1976), deep-sea exploration unit, submarine-torso hybrid robot, anchor motif, square 1:1.`,
    'horizon-n': `Product portrait: HORIZON-N (1977), Arctic far-north unit, insulated panels, frost-resistant visor, square 1:1.`,
    'horizon-inf': `Product portrait: HORIZON-∞ (1978) classified, abstract infinity symbol merged with robot silhouette, mostly obscured, square 1:1.`,
    'signal-1': `Product portrait: SIGNAL-1 prototype (1978), tall antenna head, listening dish ears, Sept-Îles trials, square 1:1.`,
    'signal-2': `Product portrait: SIGNAL-2 prototype (1979), transatlantic relay, twin antenna array, square 1:1.`
};

const SERIES_SUBJECT: Record<string, string> = {
    'la-chose': `Series hero portrait: SÉRIE 00 LA CHOSE, single prototype lineage, archive palette, one iconic garage-built robot centered, caption years 1968, square catalogue image, bottom ink band empty for series name typography.`,
    maison: `Series hero portrait: SÉRIE 01 MAISON domestic line, friendly home robot silhouette, warm orange sun disk, years 1970–1979 mood, square 1:1, bottom band empty.`,
    industrie: `Series hero portrait: SÉRIE 02 INDUSTRIE, factory arm and gantry motifs, steel blue and yellow, never sleeps mood, square 1:1.`,
    compagnon: `Series hero portrait: SÉRIE 03 COMPAGNON, companion robot with open posture, conversational Teal and coral, someone to talk to, square 1:1.`,
    horizon: `Series hero portrait: SÉRIE 04 HORIZON, exploration robot with depth waves behind, ocean and infinity mood, square 1:1.`,
    signal: `Series hero portrait: SÉRIE 05 SIGNAL, antenna robot listening, broadcast arcs, next-series teaser 1979, square 1:1.`
};

function authorSubject(name: string, kind: 'human' | 'robot', roleHint: string): string {
    if (kind === 'robot') {
        return `Editorial duotone portrait, shoulders up: ${name}, robot author (${roleHint}).
Geometric robot head or upper torso, strong silhouette, two flat spot colors plus paper, halftone shading, not photographic.
Square 1:1, upper-right corner calm for initials overlay later.`;
    }
    return `Editorial duotone portrait, shoulders up: ${name}, ${roleHint}, fictional 1970s Montréal editorial staff.
Simplified geometric face and hair silhouette, no celebrity likeness, two spot colors plus paper, halftone texture.
Square 1:1, upper-right corner calm for initials overlay later.`;
}

const AUTHOR_ROLE: Record<string, string> = {
    henri: 'founder, electrical engineer',
    diane: 'research director, mathematician',
    yves: 'chief engineer, co-founder',
    marguerite: 'freelance journalist',
    celeste: 'philosopher, deputy editor',
    sophie: 'investigative correspondent',
    jf: 'architecture correspondent',
    'unit-7': 'COMPAGNON editorial writing unit',
    'horizon-003': 'deep-sea expedition unit',
    louise: 'editor-in-chief',
    theo: 'photographer and layout artist',
    'maison-3-trois': 'MAISON-3 food columnist unit',
    'pierre-yves': 'letters editor'
};

function posterSubject(
    titleFr: string,
    subtitleEn: string,
    palette: PaletteName,
    kind: string
): string {
    return `Event poster ILLUSTRATION PLATE ONLY (no dates, no venue text, no titles).
Event: ${titleFr} / ${subtitleEn}. Type: ${kind}.
Bold 1970s constructivist shapes (circles, triangles, rectangles) in spot colors, bottom area calmer for future title overlay,
top black band area empty for date and venue typography. Portrait 3:4 poster proportions.`;
}

function buildSpecs(): ArtImagePromptSpec[] {
    const specs: ArtImagePromptSpec[] = [];

    specs.push({
        key: 'logo',
        category: 'brand',
        aspectRatio: '1:1',
        folder: 'brand',
        palette: 'maison',
        subject: `Brand mark illustration only (no wordmark): geometric sun-gear icon, orange rounded square background #d8622b,
dark ink circle with six radial pegs and center hub, flat screen-print, square 512px feel, simple industrial logo.`,
        overlayNote: 'SVG logo remains canonical for UI; AI variant optional.'
    });

    for (const issue of ISSUES) {
        specs.push({
            key: `cover-${issue.id}`,
            category: 'cover-illustration',
            aspectRatio: '3:4',
            folder: 'covers',
            palette: issue.palette as PaletteName,
            subject: `${COVER_MOTIF_SUBJECT[issue.motif] ?? COVER_MOTIF_SUBJECT.dawn}\nIssue theme: ${issue.name[0]} / ${issue.name[1]}. Season: ${issue.dateline}.`,
            overlayNote:
                'Composite with issueCover() SVG for MOTEUR JOURNAL masthead, number, titles, price.'
        });
    }

    for (const s of SERIES) {
        specs.push({
            key: `series-${s.id}`,
            category: 'series',
            aspectRatio: '1:1',
            folder: 'catalogue',
            palette: s.palette,
            subject: SERIES_SUBJECT[s.id] ?? `Series hero robot for ${s.name}, ${s.tagline[1]}`
        });
    }

    for (const r of ROBOT_INFO) {
        specs.push({
            key: `robot-${r.id}`,
            category: 'robot',
            aspectRatio: '1:1',
            folder: 'catalogue',
            palette: SERIES.find(s => s.id === r.series)?.palette ?? 'archive',
            subject:
                ROBOT_SUBJECT[r.id] ??
                `Product portrait: ${r.name} (${r.year}), ${r.series} series robot, geometric catalogue illustration, square 1:1, bottom band empty for name.`
        });
    }

    for (const a of AUTHOR_ART) {
        specs.push({
            key: `author-${a.id}`,
            category: 'author',
            aspectRatio: '1:1',
            folder: 'people',
            palette: a.palette,
            subject: authorSubject(a.name, a.kind, AUTHOR_ROLE[a.id] ?? 'journal contributor')
        });
    }

    for (const [key, scene] of Object.entries(SCENE_SUBJECT)) {
        specs.push({
            key,
            category: 'article-scene',
            aspectRatio: '16:10',
            folder: 'illustrations',
            palette: scene.palette,
            subject: scene.subject
        });
    }

    specs.push(
        {
            key: 'chart-units',
            category: 'chart',
            aspectRatio: '16:10',
            folder: 'illustrations',
            palette: 'signal',
            subject: `Data journalism illustration: bar chart of cumulative deployed units 1970–1978 (1970 small, 1978 tallest),
flat bars, mono axis ticks without readable numbers, title area blank at top, signal palette red and slate,
landscape 16:10, halftone paper.`
        },
        {
            key: 'chart-waitlist',
            category: 'chart',
            aspectRatio: '16:10',
            folder: 'illustrations',
            palette: 'compagnon',
            subject: `Data journalism illustration: COMPAGNON-9 waiting list growth 1977 T1–T4, rising bars,
teal and coral, editorial chart aesthetic, no readable numbers, landscape 16:10.`
        }
    );

    for (const e of EVENTS) {
        specs.push({
            key: `poster-${e.id}`,
            category: 'event-poster-illustration',
            aspectRatio: '3:4',
            folder: 'events',
            palette: e.palette,
            subject: posterSubject(e.title[0], e.title[1], e.palette, e.kind),
            overlayNote: 'Composite with poster() SVG for date, venue, title lines.'
        });
    }

    return specs;
}

export const ART_IMAGE_PROMPT_SPECS: ArtImagePromptSpec[] = buildSpecs();

/** Copy-paste ready prompts keyed by art key (matches `{ art: 'key' }` in demo content). */
export const ART_IMAGE_PROMPTS_COMPLETE: Record<string, string> = Object.fromEntries(
    ART_IMAGE_PROMPT_SPECS.map(s => [s.key, assemblePrompt(s)])
);

/** Serialises every complete prompt to YAML (see packages/demo/art-image-prompts.yaml). */
export function renderArtPromptsYaml(): string {
    const lines: string[] = [
        '# Moteur Journal — complete AI image prompts (one prompt per art key)',
        '# Source: src/journal/art-image-prompts.ts — regenerate with:',
        '#   pnpm --filter @moteurio/demo exec tsx src/journal/dump-art-prompts.ts',
        '#',
        `# Recommended: ${RECOMMENDED_GENERATOR.provider} / ${RECOMMENDED_GENERATOR.model}`,
        '',
        'style_bible: |',
        ...STYLE_BIBLE.split('\n').map(l => `  ${l}`),
        '',
        'negative_prompt: |',
        ...NEGATIVE_PROMPT.split('\n').map(l => `  ${l}`),
        '',
        'assets:'
    ];
    for (const spec of ART_IMAGE_PROMPT_SPECS) {
        lines.push(`  ${spec.key}:`);
        lines.push(`    category: ${spec.category}`);
        lines.push(`    aspect_ratio: "${spec.aspectRatio}"`);
        lines.push(`    folder: ${spec.folder}`);
        lines.push(`    palette: ${spec.palette}`);
        if (spec.overlayNote) {
            lines.push(`    overlay_note: ${JSON.stringify(spec.overlayNote)}`);
        }
        lines.push('    prompt: |');
        for (const line of ART_IMAGE_PROMPTS_COMPLETE[spec.key].split('\n')) {
            lines.push(`      ${line}`);
        }
        lines.push('');
    }
    return `${lines.join('\n')}\n`;
}

import type { ArtSpec } from '../runtime/assets.js';
import {
    authorPortrait,
    chart,
    issueCover,
    logo,
    poster,
    robotPortrait,
    scene,
    type CoverMotif,
    type SceneKind
} from '../art/generators.js';
import { pdf } from '../art/media.js';
import type { PaletteName } from '../art/svg.js';
import { SERIES, ROBOT_INFO } from './content/catalogue.js';
import { AUTHOR_ART } from './content/art-info.js';
import { ISSUES } from './content/issues.js';
import { EVENTS } from './content/events.js';

/** Every generated file in the Journal's media library, by key. */
export function art(): ArtSpec[] {
    const specs: ArtSpec[] = [];
    const palette = (seriesId: string): PaletteName =>
        SERIES.find(s => s.id === seriesId)?.palette ?? 'archive';

    specs.push({
        key: 'logo',
        filename: 'moteur-logo.png',
        alt: { fr: 'Logo Moteur', en: 'Moteur logo' },
        folder: 'brand',
        svg: () => logo(),
        format: 'png'
    });

    for (const issue of ISSUES) {
        specs.push({
            key: `cover-${issue.id}`,
            filename: `couverture-${issue.number}.jpg`,
            alt: {
                fr: `Couverture du numéro ${issue.number}: ${issue.name[0]}`,
                en: `Cover of issue ${issue.number}: ${issue.name[1]}`
            },
            folder: 'covers',
            credit: 'Théo Nguyen',
            svg: () =>
                issueCover({
                    number: issue.number,
                    titleFr: issue.name[0],
                    titleEn: issue.name[1],
                    dateline: issue.dateline,
                    motif: issue.motif as CoverMotif,
                    palette: issue.palette as PaletteName,
                    price: issue.price === 0 ? 'GRATUIT' : `${Math.round(issue.price * 100)}¢`
                }),
            format: 'jpeg'
        });
        if (issue.print) {
            specs.push({
                key: `print-${issue.id}`,
                filename: `moteur-journal-${issue.number}.pdf`,
                alt: {
                    fr: `Édition imprimée, numéro ${issue.number}`,
                    en: `Print edition, issue ${issue.number}`
                },
                folder: 'print',
                file: () =>
                    pdf([
                        {
                            title: `MOTEUR JOURNAL N° ${issue.number} — ${issue.name[0]}`,
                            paragraphs: [issue.intro[0], issue.intro[1]]
                        },
                        { title: 'Sommaire / Contents', paragraphs: issue.contents }
                    ]),
                mimeType: 'application/pdf'
            });
        }
    }

    for (const s of SERIES) {
        specs.push({
            key: `series-${s.id}`,
            filename: `serie-${s.id}.jpg`,
            alt: { fr: `Série ${s.name}`, en: `${s.name} series` },
            folder: 'catalogue',
            svg: () =>
                robotPortrait({
                    name: `SÉRIE ${s.number} · ${s.name}`,
                    palette: s.palette,
                    caption: s.years
                }),
            format: 'jpeg'
        });
    }
    for (const r of ROBOT_INFO) {
        specs.push({
            key: `robot-${r.id}`,
            filename: `${r.id}.png`,
            alt: { fr: `Portrait du ${r.name}`, en: `Portrait of the ${r.name}` },
            folder: 'catalogue',
            credit: 'Archives Moteur',
            svg: () =>
                robotPortrait({
                    name: r.name,
                    palette: palette(r.series),
                    caption: String(r.year)
                }),
            format: 'png'
        });
    }

    for (const a of AUTHOR_ART) {
        specs.push({
            key: `author-${a.id}`,
            filename: `portrait-${a.id}.jpg`,
            alt: { fr: `Portrait de ${a.name}`, en: `Portrait of ${a.name}` },
            folder: 'people',
            credit: 'Théo Nguyen',
            svg: () => authorPortrait({ name: a.name, kind: a.kind, palette: a.palette }),
            format: 'jpeg'
        });
    }

    const scenes: Array<[string, SceneKind, PaletteName, string, string, string?]> = [
        [
            'scene-garage',
            'garage',
            'maison',
            'Le garage de la rue Saint-Denis, hiver 1968',
            'The Rue Saint-Denis garage, winter 1968'
        ],
        ['scene-skyline', 'skyline', 'maison', 'Montréal vue du port', 'Montréal from the harbour'],
        ['scene-skyline-dusk', 'skyline', 'signal', 'Montréal au crépuscule', 'Montréal at dusk'],
        [
            'scene-factory',
            'factory',
            'industrie',
            'L’usine de Rouyn-Noranda, 3 h du matin',
            'The Rouyn-Noranda plant, 3 a.m.'
        ],
        [
            'scene-factory-lachine',
            'factory',
            'maison',
            'Chaîne MAISON, usine de Lachine',
            'MAISON line, Lachine plant'
        ],
        [
            'scene-ocean',
            'ocean',
            'horizon',
            'HORIZON-E à 3 847 mètres',
            'HORIZON-E at 3,847 metres'
        ],
        [
            'scene-ocean-north',
            'ocean',
            'compagnon',
            'Sous la glace, baie d’Ungava',
            'Under the ice, Ungava Bay'
        ],
        [
            'scene-blueprint-la-chose',
            'blueprint',
            'horizon',
            'Plan de LA CHOSE, 1968',
            'LA CHOSE blueprint, 1968',
            'LA CHOSE · PROTOTYPE 0'
        ],
        [
            'scene-blueprint-arm',
            'blueprint',
            'industrie',
            'Plan du bras INDUSTRIE-F',
            'INDUSTRIE-F arm blueprint',
            'INDUSTRIE-F · BRAS 6 AXES'
        ],
        [
            'scene-blueprint-signal',
            'blueprint',
            'signal',
            'Plan de l’antenne SIGNAL-1',
            'SIGNAL-1 antenna blueprint',
            'SIGNAL-1 · ANTENNE'
        ]
    ];
    for (const [key, kind, pal, fr, en, label] of scenes) {
        specs.push({
            key,
            filename: `${key.replace('scene-', '')}.jpg`,
            alt: { fr, en },
            folder: 'illustrations',
            credit: kind === 'blueprint' ? 'Bureau d’études Moteur' : 'Théo Nguyen',
            svg: () => scene({ kind, seed: key, palette: pal, label }),
            format: 'jpeg'
        });
    }

    specs.push({
        key: 'chart-units',
        filename: 'unites-deployees.png',
        alt: {
            fr: 'Unités déployées par année, 1970–1978',
            en: 'Units deployed per year, 1970–1978'
        },
        folder: 'illustrations',
        svg: () =>
            chart({
                title: 'Unités déployées · Units deployed',
                unit: 'cumul, toutes séries · cumulative, all series',
                bars: [
                    { label: '1970', value: 1200 },
                    { label: '1972', value: 5400 },
                    { label: '1974', value: 14800 },
                    { label: '1976', value: 31000 },
                    { label: '1978', value: 47000 }
                ],
                palette: 'signal'
            }),
        format: 'png'
    });
    specs.push({
        key: 'chart-waitlist',
        filename: 'liste-attente.png',
        alt: { fr: 'Liste d’attente COMPAGNON-9', en: 'COMPAGNON-9 waiting list' },
        folder: 'illustrations',
        svg: () =>
            chart({
                title: 'Liste d’attente · Waiting list',
                unit: 'COMPAGNON-9, noms inscrits · names registered',
                bars: [
                    { label: '1977 T1', value: 1900 },
                    { label: 'T2', value: 3400 },
                    { label: 'T3', value: 5600 },
                    { label: 'T4', value: 8243 }
                ],
                palette: 'compagnon'
            }),
        format: 'png'
    });

    for (const e of EVENTS) {
        specs.push({
            key: `poster-${e.id}`,
            filename: `affiche-${e.id}.jpg`,
            alt: { fr: `Affiche: ${e.title[0]}`, en: `Poster: ${e.title[1]}` },
            folder: 'events',
            svg: () =>
                poster({
                    title: e.title[0],
                    subtitle: e.title[1],
                    date: e.posterDate,
                    place: e.venue.toUpperCase(),
                    palette: e.palette
                }),
            format: 'jpeg'
        });
    }

    specs.push({
        key: 'press-kit',
        filename: 'dossier-de-presse-1978.pdf',
        alt: { fr: 'Dossier de presse 1978', en: '1978 press kit' },
        folder: 'press',
        file: () =>
            pdf([
                {
                    title: 'Moteur Industries S.A. — Dossier de presse 1978',
                    paragraphs: [
                        'Fondée à Montréal en 1968. 47 000 unités déployées dans 12 pays. Cinq séries: MAISON, INDUSTRIE, COMPAGNON, HORIZON et SIGNAL.',
                        'Contact presse: presse@moteur-journal.test · 514 555-0168'
                    ]
                },
                {
                    title: 'Press kit 1978 (English)',
                    paragraphs: [
                        'Founded in Montréal in 1968. 47,000 units deployed in 12 countries. Five series: MAISON, INDUSTRIE, COMPAGNON, HORIZON and SIGNAL.'
                    ]
                }
            ]),
        mimeType: 'application/pdf'
    });
    return specs;
}

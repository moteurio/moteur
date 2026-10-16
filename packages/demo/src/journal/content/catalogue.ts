import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';
import type { PaletteName } from '../../art/svg.js';

/** Product lines (series) and the robots in them. */

export type SeriesInfo = {
    id: string;
    number: string;
    name: string;
    palette: PaletteName;
    color: string;
    years: string;
    tagline: [string, string];
    description: [string, string];
};

export const SERIES: SeriesInfo[] = [
    {
        id: 'la-chose',
        number: '00',
        name: 'LA CHOSE',
        palette: 'archive',
        color: '#8a6a43',
        years: '1968',
        tagline: ['Le prototype qui a tout commencé.', 'The prototype that started it all.'],
        description: [
            'Un seul exemplaire, 92 kilos, construit dans un garage. Exposé aujourd’hui au siège, rue Notre-Dame.',
            'A single unit, 92 kilos, built in a garage. Now on display at head office on Rue Notre-Dame.'
        ]
    },
    {
        id: 'maison',
        number: '01',
        name: 'MAISON',
        palette: 'maison',
        color: '#d8622b',
        years: '1970–1979',
        tagline: ['Pour la maison, et ceux qui y vivent.', 'For the home, and the people in it.'],
        description: [
            'La série domestique. Cuisine, ménage, devoirs, et depuis le MAISON-3, la **mémoire contextuelle**: elle se souvient que vous détestez le céleri.',
            'The domestic line. Cooking, cleaning, homework, and since the MAISON-3, **contextual memory**: it remembers you hate celery.'
        ]
    },
    {
        id: 'industrie',
        number: '02',
        name: 'INDUSTRIE',
        palette: 'industrie',
        color: '#2f5d8a',
        years: '1971–',
        tagline: [
            'Elles ne dorment jamais. Elles ne se plaignent pas non plus.',
            'They never sleep. They never complain, either.'
        ],
        description: [
            'Bras articulés, chaînes de montage, mines et chantiers navals. 31 000 unités dans 12 pays.',
            'Articulated arms, assembly lines, mines and shipyards. 31,000 units in 12 countries.'
        ]
    },
    {
        id: 'compagnon',
        number: '03',
        name: 'COMPAGNON',
        palette: 'compagnon',
        color: '#2f8a6e',
        years: '1969–',
        tagline: ['Quelqu’un à qui parler.', 'Someone to talk to.'],
        description: [
            'La série la plus aimée, et la plus discutée. Liste d’attente: quatre ans.',
            'The most loved series, and the most debated. Waiting list: four years.'
        ]
    },
    {
        id: 'horizon',
        number: '04',
        name: 'HORIZON',
        palette: 'horizon',
        color: '#1b4965',
        years: '1975–',
        tagline: ['Là où les humains ne peuvent pas aller.', 'Where people cannot go.'],
        description: [
            'Exploration: grands fonds, Grand Nord, et une unité dont nous ne pouvons pas parler.',
            'Exploration: the deep ocean, the far north, and one unit we cannot talk about.'
        ]
    },
    {
        id: 'signal',
        number: '05',
        name: 'SIGNAL',
        palette: 'signal',
        color: '#c0392b',
        years: '1978–',
        tagline: [
            'La prochaine série. Elle écoute déjà.',
            'The next series. It is already listening.'
        ],
        description: [
            'Communications longue portée. Annoncée pour 1979; les premières unités sont en essai à Sept-Îles.',
            'Long-range communications. Announced for 1979; the first units are in trials in Sept-Îles.'
        ]
    }
];

export const series: SourceEntry[] = SERIES.map((s, i) => ({
    id: s.id,
    daysAgo: 128,
    by: who('theo'),
    // SIGNAL is announced but its page is still with the reviewer.
    state: s.id === 'signal' ? 'in-review' : 'published',
    data: {
        number: s.number,
        name: s.name,
        slug: s.id,
        tagline: t(...s.tagline),
        description: t(...s.description),
        years: s.years,
        color: s.color,
        hero: { art: `series-${s.id}` },
        order: i,
        ...(s.id === 'compagnon' && {
            body: [
                {
                    type: 'core/heading',
                    data: { text: t('Trois générations', 'Three generations'), level: 'h2' }
                },
                {
                    type: 'demo/timeline',
                    data: {
                        events: [
                            {
                                year: '1969',
                                event: t(
                                    'COMPAGNON-1, l’originale. 40 unités.',
                                    'COMPAGNON-1, the original. 40 units.'
                                )
                            },
                            {
                                year: '1973',
                                event: t(
                                    'COMPAGNON-4: la voix devient chaude.',
                                    'COMPAGNON-4: the voice turns warm.'
                                )
                            },
                            {
                                year: '1977',
                                event: t(
                                    'COMPAGNON-9 et la liste d’attente de quatre ans.',
                                    'COMPAGNON-9 and the four-year waiting list.'
                                )
                            }
                        ]
                    }
                },
                {
                    type: 'core/gallery',
                    data: {
                        images: [
                            { art: 'robot-compagnon-1' },
                            { art: 'robot-compagnon-4' },
                            { art: 'robot-compagnon-9' }
                        ],
                        caption: t(
                            'De gauche à droite: 1969, 1973, 1977.',
                            'Left to right: 1969, 1973, 1977.'
                        )
                    }
                }
            ]
        })
    }
}));

type RobotSrc = {
    id: string;
    name: string;
    series: string;
    status: 'available' | 'waitlist' | 'classified' | 'discontinued' | 'prototype';
    year: number;
    price?: number;
    tagline: [string, string];
    description?: [string, string?];
    specs?: Array<[string, string, string, string]>;
    colorway?: string;
    icon?: string;
    gallery?: boolean;
    manual?: [string, string?];
    telemetry?: Record<string, unknown>;
    film?: { provider: string; target: string };
    measurements?: string[][];
    plant?: [number, number];
    state?: SourceEntry['state'];
    daysAgo?: number;
    edits?: SourceEntry['edits'];
    review?: SourceEntry['review'];
    comments?: SourceEntry['comments'];
    scheduleInDays?: number;
};

const PLANTS: Record<string, [number, number]> = {
    lachine: [45.4314, -73.6747],
    rouyn: [48.2366, -79.0231],
    septiles: [50.2169, -66.3814],
    stdenis: [45.5236, -73.5806]
};

const robot = (r: RobotSrc, order: number): SourceEntry => ({
    id: r.id,
    daysAgo: r.daysAgo ?? 110 - order,
    by: who('theo'),
    state: r.state,
    edits: r.edits,
    review: r.review,
    comments: r.comments,
    scheduleInDays: r.scheduleInDays,
    data: {
        name: r.name,
        slug: r.id,
        series: r.series,
        tagline: t(...r.tagline),
        ...(r.description && {
            description:
                r.description[1] === undefined
                    ? { fr: r.description[0] }
                    : t(r.description[0], r.description[1])
        }),
        status: r.status,
        releaseYear: r.year,
        ...(r.price !== undefined && { price: r.price }),
        ...(r.colorway && { colorway: r.colorway }),
        ...(r.icon && { icon: r.icon }),
        image: { art: `robot-${r.id}` },
        ...(r.gallery && {
            gallery: [
                { art: `robot-${r.id}` },
                { art: 'scene-blueprint-arm' },
                { art: 'scene-factory' }
            ]
        }),
        ...(r.specs && {
            specs: r.specs.map(([lfr, len, vfr, ven]) => ({
                label: t(lfr, len),
                value: t(vfr, ven)
            }))
        }),
        // core/table is stored wrapped ({ value: … }), unlike most fields.
        ...(r.measurements && {
            measurements: {
                value: { columnTitles: r.measurements[0], rows: r.measurements.slice(1) }
            }
        }),
        ...(r.manual && {
            manual: r.manual[1] === undefined ? { fr: r.manual[0] } : t(r.manual[0], r.manual[1])
        }),
        ...(r.telemetry && { telemetry: r.telemetry }),
        ...(r.film && { film: r.film }),
        ...(r.plant && { baseLocation: { lat: r.plant[0], lng: r.plant[1] } }),
        order
    }
});

const MAISON_MANUAL_FR = `## Premiers jours

Votre MAISON-3 observe pendant **sept jours** avant de proposer quoi que ce soit. C’est normal.

1. Montrez-lui la cuisine, puis la buanderie.
2. Dites-lui ce que vous n’aimez pas. Elle s’en souviendra.
3. Ne la laissez pas seule avec le chat la première semaine.

> La mémoire contextuelle s’efface sur demande: dites « Trois, oublie ».

| Tâche | Durée moyenne |
|---|---|
| Vaisselle (4 couverts) | 11 min |
| Devoirs de mathématiques | variable |
`;

const MAISON_MANUAL_EN = `## The first days

Your MAISON-3 watches for **seven days** before suggesting anything. This is normal.

1. Show it the kitchen, then the laundry room.
2. Tell it what you dislike. It will remember.
3. Don’t leave it alone with the cat in the first week.

> Contextual memory can be wiped on request: say "Three, forget".

| Task | Average time |
|---|---|
| Dishes (4 settings) | 11 min |
| Maths homework | varies |
`;

const ROBOTS: RobotSrc[] = [
    {
        id: 'la-chose',
        name: 'LA CHOSE',
        series: 'la-chose',
        status: 'discontinued',
        year: 1968,
        tagline: [
            '92 kilos de métal et de bonne volonté.',
            '92 kilos of metal and good intentions.'
        ],
        description: [
            'Premier test réussi: porter un plateau de café sans le renverser. Onzième essai.',
            'First successful test: carrying a tray of coffee without spilling it. Eleventh attempt.'
        ],
        measurements: [
            ['', 'Hauteur / Height', 'Poids / Weight', 'Autonomie / Battery'],
            ['LA CHOSE', '142 cm', '92 kg', '40 min']
        ],
        plant: PLANTS.stdenis
    },
    {
        id: 'maison-1',
        name: 'MAISON-1',
        series: 'maison',
        status: 'discontinued',
        year: 1970,
        price: 4800,
        tagline: [
            'La première à entrer dans les cuisines.',
            'The first to enter people’s kitchens.'
        ],
        specs: [
            ['Mémoire', 'Memory', 'Aucune', 'None'],
            ['Tâches', 'Tasks', '12', '12']
        ]
    },
    {
        id: 'maison-3',
        name: 'MAISON-3',
        series: 'maison',
        status: 'available',
        year: 1975,
        price: 7400,
        colorway: '#d8622b',
        icon: 'lucide:home',
        gallery: true,
        tagline: ['Elle se souvient que vous détestez le céleri.', 'It remembers you hate celery.'],
        description: [
            'La première MAISON dotée de la **mémoire contextuelle** de Diane Tremblay. 6 200 foyers au Québec.\n\n- Cuisine\n- Lessive\n- Devoirs (sauf la dictée)',
            'The first MAISON with Diane Tremblay’s **contextual memory**. 6,200 homes in Québec.\n\n- Cooking\n- Laundry\n- Homework (except spelling)'
        ],
        specs: [
            ['Mémoire', 'Memory', 'Contextuelle, 30 jours', 'Contextual, 30 days'],
            ['Autonomie', 'Battery', '14 h', '14 h'],
            ['Langues', 'Languages', 'Français, anglais', 'French, English']
        ],
        measurements: [
            ['', 'Hauteur / Height', 'Poids / Weight', 'Autonomie / Battery'],
            ['MAISON-1', '120 cm', '68 kg', '6 h'],
            ['MAISON-3', '132 cm', '61 kg', '14 h'],
            ['MAISON-7', '128 cm', '54 kg', '20 h']
        ],
        manual: [MAISON_MANUAL_FR, MAISON_MANUAL_EN],
        telemetry: {
            sampleRateHz: 2,
            channels: ['battery', 'temperature', 'memory.load'],
            uplink: 'nightly',
            retentionDays: 30
        },
        film: { provider: 'youtube', target: 'moteur-maison-3-1975' },
        plant: PLANTS.lachine,
        state: 'edited',
        edits: [
            {
                by: who('theo'),
                daysAgo: 4,
                data: {
                    price: 6900,
                    tagline: t(
                        'Elle se souvient que vous détestez le céleri. Maintenant à 6 900 $.',
                        'It remembers you hate celery. Now $6,900.'
                    )
                }
            }
        ]
    },
    {
        id: 'maison-7',
        name: 'MAISON-7',
        series: 'maison',
        status: 'waitlist',
        year: 1978,
        price: 8900,
        tagline: ['Plus légère, plus patiente.', 'Lighter, more patient.'],
        specs: [['Mémoire', 'Memory', 'Contextuelle, 1 an', 'Contextual, 1 year']],
        plant: PLANTS.lachine
    },
    {
        id: 'maison-9',
        name: 'MAISON-9',
        series: 'maison',
        status: 'prototype',
        year: 1979,
        tagline: ['En essai chez douze familles.', 'In trials with twelve families.'],
        state: 'draft',
        daysAgo: 9
    },
    {
        id: 'industrie-a',
        name: 'INDUSTRIE-A',
        series: 'industrie',
        status: 'discontinued',
        year: 1971,
        tagline: ['Un bras, une tâche, aucune pause.', 'One arm, one task, no breaks.'],
        plant: PLANTS.rouyn
    },
    {
        id: 'industrie-f',
        name: 'INDUSTRIE-F',
        series: 'industrie',
        status: 'available',
        year: 1974,
        price: 41000,
        colorway: '#2f5d8a',
        icon: 'lucide:factory',
        gallery: true,
        tagline: ['L’usine qui ne dort jamais.', 'The factory that never sleeps.'],
        description: [
            'Bras à six axes, précision de 0,2 mm. Fonctionne à −30 °C. Le modèle le plus vendu de Moteur.',
            'Six-axis arm, 0.2 mm precision. Works at −30 °C. Moteur’s best-selling model.'
        ],
        specs: [
            ['Axes', 'Axes', '6', '6'],
            ['Précision', 'Precision', '0,2 mm', '0.2 mm'],
            ['Charge utile', 'Payload', '180 kg', '180 kg'],
            ['Température', 'Operating range', '−30 °C à 50 °C', '−30 °C to 50 °C']
        ],
        telemetry: {
            sampleRateHz: 50,
            channels: ['torque.1', 'torque.2', 'torque.3', 'torque.4', 'torque.5', 'torque.6'],
            uplink: 'realtime'
        },
        film: { provider: 'vimeo', target: '1976001' },
        plant: PLANTS.rouyn
    },
    {
        id: 'industrie-x',
        name: 'INDUSTRIE-X',
        series: 'industrie',
        status: 'classified',
        year: 1977,
        tagline: ['[CONFIDENTIEL]', '[CLASSIFIED]'],
        description: [
            'Nous ne pouvons rien dire. ██████ ███ ████████.',
            'We cannot say anything. ██████ ███ ████████.'
        ]
    },
    {
        id: 'industrie-m',
        name: 'INDUSTRIE-M',
        series: 'industrie',
        status: 'available',
        year: 1976,
        price: 52000,
        tagline: ['Pour les mines de l’Abitibi.', 'Built for the mines of Abitibi.'],
        plant: PLANTS.rouyn
    },
    {
        id: 'industrie-n',
        name: 'INDUSTRIE-N',
        series: 'industrie',
        status: 'available',
        year: 1977,
        price: 47500,
        tagline: ['Chantiers navals, de Lauzon à Lisbonne.', 'Shipyards, from Lauzon to Lisbon.'],
        state: 'in-review',
        review: {},
        daysAgo: 5,
        comments: [
            {
                by: who('celeste'),
                field: 'tagline',
                body: 'Lisbonne: avons-nous confirmé le contrat? Sinon, retirer.'
            }
        ]
    },
    {
        id: 'compagnon-1',
        name: 'COMPAGNON-1',
        series: 'compagnon',
        status: 'discontinued',
        year: 1969,
        tagline: ['L’originale. 1969–1977.', 'The original. 1969–1977.'],
        description: [
            'Quarante unités. La dernière a été mise hors service en mars 1977. Voir la nécrologie, numéro 04.',
            'Forty units. The last was retired in March 1977. See the obituary in issue 04.'
        ]
    },
    {
        id: 'compagnon-4',
        name: 'COMPAGNON-4',
        series: 'compagnon',
        status: 'discontinued',
        year: 1973,
        tagline: ['La voix devient chaude.', 'The voice turns warm.']
    },
    {
        id: 'compagnon-9',
        name: 'COMPAGNON-9',
        series: 'compagnon',
        status: 'waitlist',
        year: 1977,
        price: 12500,
        colorway: '#2f8a6e',
        icon: 'lucide:heart',
        gallery: true,
        tagline: [
            'Quatre ans d’attente. Trente ans de garantie.',
            'Four years’ wait. Thirty years’ warranty.'
        ],
        description: [
            '8 243 noms sur la liste. Délai moyen: 4 ans et 2 mois.',
            '8,243 names on the list. Average wait: 4 years and 2 months.'
        ],
        specs: [
            ['Délai de livraison', 'Delivery wait', '4 ans 2 mois', '4 years 2 months'],
            ['Garantie', 'Warranty', '30 ans', '30 years'],
            ['Conversation', 'Conversation', 'Illimitée', 'Unlimited']
        ],
        film: { provider: 'youtube', target: 'moteur-compagnon-9-1977' },
        plant: PLANTS.lachine
    },
    {
        id: 'compagnon-9-sport',
        name: 'COMPAGNON-9 Sport',
        series: 'compagnon',
        status: 'available',
        year: 1978,
        price: 13900,
        tagline: [
            'Pour ceux qui courent le marathon de Montréal.',
            'For Montréal marathon runners.'
        ],
        state: 'unpublished',
        daysAgo: 60
    },
    {
        id: 'compagnon-10',
        name: 'COMPAGNON-10',
        series: 'compagnon',
        status: 'prototype',
        year: 1979,
        tagline: ['Annonce prévue au printemps.', 'Announcement planned for spring.'],
        state: 'scheduled',
        scheduleInDays: 12,
        daysAgo: 3
    },
    {
        id: 'horizon-e',
        name: 'HORIZON-E',
        series: 'horizon',
        status: 'available',
        year: 1976,
        price: 380000,
        colorway: '#1b4965',
        icon: 'lucide:anchor',
        gallery: true,
        tagline: ['3 847 mètres sous l’Atlantique Nord.', '3,847 metres under the North Atlantic.'],
        description: [
            'Unité d’exploration en eaux profondes. Pression maximale: 400 atmosphères.',
            'Deep-water exploration unit. Maximum pressure: 400 atmospheres.'
        ],
        specs: [
            ['Profondeur max.', 'Max depth', '4 000 m', '4,000 m'],
            ['Pression', 'Pressure', '400 atm', '400 atm'],
            ['Liaison', 'Uplink', 'Radio 14,230 MHz', '14.230 MHz radio']
        ],
        telemetry: {
            sampleRateHz: 1,
            channels: ['depth', 'pressure', 'temperature', 'signal'],
            uplink: 'radio',
            frequencyMHz: 14.23
        },
        plant: PLANTS.septiles
    },
    {
        id: 'horizon-n',
        name: 'HORIZON-N',
        series: 'horizon',
        status: 'available',
        year: 1977,
        price: 240000,
        tagline: ['Le Grand Nord, sans gants.', 'The far north, no gloves.'],
        plant: PLANTS.septiles
    },
    {
        id: 'horizon-inf',
        name: 'HORIZON-∞',
        series: 'horizon',
        status: 'classified',
        year: 1978,
        tagline: ['Ce que nous pouvons dire: rien.', 'What we can tell you: nothing.']
    },
    {
        id: 'maison-2',
        name: 'MAISON-2',
        series: 'maison',
        status: 'discontinued',
        year: 1972,
        price: 5600,
        tagline: ['Celle qui a appris la lessive.', 'The one that learned laundry.']
    },
    {
        id: 'maison-5',
        name: 'MAISON-5',
        series: 'maison',
        status: 'available',
        year: 1977,
        price: 7900,
        tagline: ['Pour les grands appartements.', 'For large apartments.'],
        plant: PLANTS.lachine
    },
    {
        id: 'maison-3-blanche',
        name: 'MAISON-3 Édition blanche',
        series: 'maison',
        status: 'discontinued',
        year: 1976,
        price: 8100,
        tagline: ['Série limitée, 300 unités.', 'Limited series, 300 units.'],
        colorway: '#efe3cc'
    },
    {
        id: 'industrie-b',
        name: 'INDUSTRIE-B',
        series: 'industrie',
        status: 'discontinued',
        year: 1972,
        tagline: ['Deux bras, deux fois moins de pauses.', 'Two arms, half the breaks.']
    },
    {
        id: 'industrie-c',
        name: 'INDUSTRIE-C',
        series: 'industrie',
        status: 'available',
        year: 1975,
        price: 38000,
        tagline: ['Pour l’industrie alimentaire.', 'Built for food processing.'],
        plant: PLANTS.lachine
    },
    {
        id: 'industrie-f2',
        name: 'INDUSTRIE-F2',
        series: 'industrie',
        status: 'waitlist',
        year: 1978,
        price: 44000,
        tagline: ['L’INDUSTRIE-F, en plus silencieuse.', 'The INDUSTRIE-F, quieter.'],
        plant: PLANTS.rouyn
    },
    {
        id: 'compagnon-2',
        name: 'COMPAGNON-2',
        series: 'compagnon',
        status: 'discontinued',
        year: 1970,
        tagline: ['La première à raconter des histoires.', 'The first to tell stories.']
    },
    {
        id: 'compagnon-6',
        name: 'COMPAGNON-6',
        series: 'compagnon',
        status: 'discontinued',
        year: 1975,
        tagline: ['Celle qui chantait faux.', 'The one that sang off-key.']
    },
    {
        id: 'compagnon-9-junior',
        name: 'COMPAGNON-9 Junior',
        series: 'compagnon',
        status: 'waitlist',
        year: 1978,
        price: 9800,
        tagline: ['Pour les enfants de 6 à 12 ans.', 'For children aged 6 to 12.']
    },
    {
        id: 'horizon-a',
        name: 'HORIZON-A',
        series: 'horizon',
        status: 'discontinued',
        year: 1975,
        tagline: ['Le premier à descendre sous 1 000 mètres.', 'The first below 1,000 metres.'],
        plant: PLANTS.septiles
    },
    {
        id: 'signal-1',
        name: 'SIGNAL-1',
        series: 'signal',
        status: 'prototype',
        year: 1978,
        tagline: ['Elle écoute déjà.', 'It is already listening.'],
        plant: PLANTS.septiles,
        state: 'approved',
        review: {},
        daysAgo: 8
    },
    {
        id: 'signal-2',
        name: 'SIGNAL-2',
        series: 'signal',
        status: 'prototype',
        year: 1979,
        tagline: ['Relais transatlantique.', 'Transatlantic relay.'],
        state: 'rejected',
        review: {
            note: 'Les specs de portée ne sont pas validées par l’ingénierie. Merci de confirmer avec Yves avant de resoumettre.'
        },
        daysAgo: 7
    }
];

export const robots: SourceEntry[] = ROBOTS.map(robot);
export const ROBOT_INFO = ROBOTS.map(r => ({
    id: r.id,
    name: r.name,
    series: r.series,
    year: r.year
}));

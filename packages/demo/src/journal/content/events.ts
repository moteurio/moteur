import type { SourceEntry } from '../../runtime/types.js';
import type { PaletteName } from '../../art/svg.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';
import { isoInDays } from '../../runtime/clock.js';

/**
 * Events around the Journal. Dates are relative to the build, so the list always has past
 * events, something this week, and upcoming ones.
 */
export type EventInfo = {
    id: string;
    title: [string, string];
    kind: 'exhibition' | 'talk' | 'open-house' | 'launch' | 'workshop';
    inDays: number;
    hours?: number;
    allDay?: boolean;
    doors?: string;
    venue: string;
    address: { street: string; city: string; state: string; country: string; postalCode: string };
    location: [number, number];
    price?: number;
    soldOut?: boolean;
    tickets?: string;
    email?: string;
    phone?: string;
    description: [string, string?];
    tags: string[];
    palette: PaletteName;
    posterDate: string;
    state?: SourceEntry['state'];
    daysAgo?: number;
};

const MTL = { city: 'Montréal', state: 'QC', country: 'CA' };

const posterDate = (inDays: number) => {
    const d = new Date(isoInDays(inDays));
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const RAW: Array<Omit<EventInfo, 'posterDate'>> = [
    {
        id: 'portes-ouvertes-lachine',
        title: ['Portes ouvertes à l’usine de Lachine', 'Open house at the Lachine plant'],
        kind: 'open-house',
        inDays: -40,
        hours: 6,
        doors: '09:30',
        venue: 'Usine de Lachine',
        address: { street: '2500, boulevard Saint-Joseph', postalCode: 'H8S 2N2', ...MTL },
        location: [45.4314, -73.6747],
        price: 0,
        description: [
            'Visite guidée de la chaîne MAISON. Les enfants peuvent programmer une MAISON-1 de démonstration.',
            'Guided tour of the MAISON line. Children can program a demonstration MAISON-1.'
        ],
        tags: ['famille', 'usine'],
        palette: 'maison'
    },
    {
        id: 'conference-tremblay',
        title: ['Diane Tremblay: la mémoire des machines', 'Diane Tremblay: how machines remember'],
        kind: 'talk',
        inDays: -12,
        hours: 2,
        doors: '18:30',
        venue: 'Université de Montréal, salle B-3345',
        address: { street: '3200, rue Jean-Brillant', postalCode: 'H3T 1N8', ...MTL },
        location: [45.5017, -73.6156],
        price: 5,
        soldOut: true,
        email: 'evenements@moteur-journal.test',
        description: [
            'Conférence publique suivie d’une période de questions. **Complet.** Enregistrement disponible au numéro 06.',
            'Public lecture followed by questions. **Sold out.** Recording available in issue 06.'
        ],
        tags: ['conférence', 'mémoire contextuelle'],
        palette: 'horizon'
    },
    {
        id: 'expo-cinquante-robots',
        title: ['Exposition: cinquante robots, dix ans', 'Exhibition: fifty robots, ten years'],
        kind: 'exhibition',
        inDays: -3,
        allDay: true,
        venue: 'Musée d’art contemporain',
        address: { street: '185, rue Sainte-Catherine Ouest', postalCode: 'H2X 3X5', ...MTL },
        location: [45.5076, -73.5665],
        price: 8,
        tickets: 'https://billets.moteur-journal.test/expo',
        phone: '+1 514 555 0190',
        description: [
            'Du prototype LA CHOSE au HORIZON-E, cinquante unités prêtées par leurs propriétaires. Jusqu’à la fin du mois.',
            'From the LA CHOSE prototype to the HORIZON-E, fifty units on loan from their owners. Until the end of the month.'
        ],
        tags: ['exposition', 'histoire', 'musée'],
        palette: 'archive'
    },
    {
        id: 'atelier-programmation',
        title: ['Atelier: programmer sa MAISON', 'Workshop: program your MAISON'],
        kind: 'workshop',
        inDays: 2,
        hours: 3,
        doors: '13:45',
        venue: 'Bibliothèque du Plateau',
        address: { street: '465, avenue du Mont-Royal Est', postalCode: 'H2J 1W3', ...MTL },
        location: [45.5244, -73.5826],
        price: 15,
        tickets: 'https://billets.moteur-journal.test/atelier',
        description: ['Apportez votre manuel. Les places sont limitées à douze.'],
        tags: ['atelier', 'MAISON'],
        palette: 'maison'
    },
    {
        id: 'lancement-hors-serie',
        title: ['Lancement du hors-série SIGNAL', 'SIGNAL special issue launch'],
        kind: 'launch',
        inDays: 31,
        hours: 3,
        doors: '17:00',
        venue: 'Librairie Olivieri',
        address: { street: '5219, chemin de la Côte-des-Neiges', postalCode: 'H3T 1Y1', ...MTL },
        location: [45.4949, -73.6227],
        price: 0,
        description: [
            'Lecture, signature, et une démonstration de SIGNAL-1 si l’ingénierie l’autorise.',
            'A reading, a signing, and a SIGNAL-1 demonstration if engineering allows it.'
        ],
        tags: ['lancement', 'SIGNAL'],
        palette: 'signal',
        state: 'draft',
        daysAgo: 2
    },
    {
        id: 'salon-sept-iles',
        title: ['Salon maritime de Sept-Îles', 'Sept-Îles maritime fair'],
        kind: 'exhibition',
        inDays: 45,
        allDay: true,
        venue: 'Port de Sept-Îles',
        address: {
            street: '1, quai Mgr-Blanche',
            city: 'Sept-Îles',
            state: 'QC',
            country: 'CA',
            postalCode: 'G4R 5P3'
        },
        location: [50.2003, -66.3826],
        price: 0,
        description: [
            'Démonstration HORIZON-N en bassin.',
            'HORIZON-N demonstration in the harbour basin.'
        ],
        tags: ['HORIZON', 'maritime'],
        palette: 'horizon'
    },
    {
        id: 'table-ronde-confiance',
        title: [
            'Table ronde: peut-on faire confiance à une machine?',
            'Panel: can you trust a machine?'
        ],
        kind: 'talk',
        inDays: 9,
        hours: 2,
        doors: '19:00',
        venue: 'Théâtre Outremont',
        address: { street: '1248, avenue Bernard Ouest', postalCode: 'H2V 1V6', ...MTL },
        location: [45.5232, -73.6091],
        price: 12,
        tickets: 'https://billets.moteur-journal.test/table-ronde',
        description: [
            'Avec Céleste Armand, Unit 7-PASCAL et un invité surprise. Animation: Louise Gagnon.',
            'With Céleste Armand, Unit 7-PASCAL and a surprise guest. Hosted by Louise Gagnon.'
        ],
        tags: ['débat', 'éthique'],
        palette: 'compagnon'
    },
    {
        id: 'visite-rouyn',
        title: ['Visite de nuit: Rouyn-Noranda', 'Night tour: Rouyn-Noranda'],
        kind: 'open-house',
        inDays: 16,
        hours: 4,
        doors: '23:30',
        venue: 'Usine Leclerc & Fils',
        address: {
            street: '75, avenue Dallaire',
            city: 'Rouyn-Noranda',
            state: 'QC',
            country: 'CA',
            postalCode: 'J9X 4T5'
        },
        location: [48.2366, -79.0231],
        price: 0,
        soldOut: true,
        description: [
            'L’usine à 3 h du matin, comme dans le numéro 03.',
            'The plant at 3 a.m., as in issue 03.'
        ],
        tags: ['usine', 'INDUSTRIE', 'nuit'],
        palette: 'industrie'
    },
    {
        id: 'brunch-lecteurs',
        title: ['Brunch des lecteurs', 'Readers’ brunch'],
        kind: 'workshop',
        inDays: 23,
        hours: 2,
        doors: '10:00',
        venue: 'Café Olimpico',
        address: { street: '124, rue Saint-Viateur Ouest', postalCode: 'H2T 2L1', ...MTL },
        location: [45.5232, -73.6011],
        price: 0,
        description: [
            'Rencontrez la rédaction. MAISON-3 « Trois » apporte la tourtière.',
            'Meet the newsroom. MAISON-3 "Three" brings the tourtière.'
        ],
        tags: ['lecteurs'],
        palette: 'maison',
        state: 'edited',
        daysAgo: 25
    },
    {
        id: 'expedition-ungava',
        title: ['Conférence: un hiver sous la glace', 'Talk: a winter under the ice'],
        kind: 'talk',
        inDays: -70,
        hours: 2,
        venue: 'Planétarium Dow',
        address: { street: '1000, rue Saint-Jacques', postalCode: 'H3C 1G7', ...MTL },
        location: [45.4992, -73.5652],
        price: 6,
        description: [
            'Rapport de l’expédition HORIZON-N dans la baie d’Ungava.',
            'Report from the HORIZON-N expedition in Ungava Bay.'
        ],
        tags: ['HORIZON', 'expédition'],
        palette: 'horizon'
    },
    {
        id: 'demonstration-annulee',
        title: ['ANNULÉ — Démonstration INDUSTRIE-X', 'CANCELLED — INDUSTRIE-X demonstration'],
        kind: 'launch',
        inDays: 5,
        hours: 1,
        venue: 'Siège social',
        address: { street: '400, rue Notre-Dame Ouest', postalCode: 'H2Y 1V3', ...MTL },
        location: [45.5017, -73.5579],
        description: [
            'Annulé pour des raisons que nous ne pouvons pas expliquer.',
            'Cancelled for reasons we cannot explain.'
        ],
        tags: ['INDUSTRIE-X'],
        palette: 'industrie',
        state: 'unpublished',
        daysAgo: 30
    },
    {
        id: 'marathon',
        title: ['Marathon de Montréal: équipe COMPAGNON', 'Montréal marathon: team COMPAGNON'],
        kind: 'open-house',
        inDays: 60,
        allDay: true,
        venue: 'Pont Jacques-Cartier',
        address: { street: 'Pont Jacques-Cartier', postalCode: 'H2K 4P2', ...MTL },
        location: [45.5233, -73.5418],
        price: 25,
        tickets: 'https://billets.moteur-journal.test/marathon',
        description: [
            'Courez aux côtés de douze COMPAGNON-9 Sport.',
            'Run alongside twelve COMPAGNON-9 Sport units.'
        ],
        tags: ['sport', 'COMPAGNON'],
        palette: 'compagnon'
    }
];

export const EVENTS: EventInfo[] = RAW.map(e => ({ ...e, posterDate: posterDate(e.inDays) }));

export const events: SourceEntry[] = EVENTS.map((e, i) => {
    const startsAt = e.allDay ? isoInDays(e.inDays, 14) : isoInDays(e.inDays, 22);
    const endsAt = e.allDay
        ? isoInDays(e.inDays + 0, 23)
        : new Date(new Date(startsAt).getTime() + (e.hours ?? 2) * 3600_000).toISOString();
    return {
        id: e.id,
        daysAgo: e.daysAgo ?? Math.min(100, Math.max(10, 50 - e.inDays)) - i * 0.1,
        by: who('sophie'),
        state: e.state,
        ...(e.state === 'edited' && {
            edits: [
                {
                    by: who('sophie'),
                    daysAgo: 1,
                    data: { venue: 'Café Olimpico (terrasse)', price: 5 }
                }
            ]
        }),
        data: {
            title: t(...e.title),
            slug: t(e.id, e.id),
            kind: e.kind,
            startsAt,
            endsAt,
            ...(e.doors && { doorsOpen: e.doors }),
            venue: e.venue,
            address: e.address,
            location: { lat: e.location[0], lng: e.location[1] },
            ...(e.price !== undefined && { price: e.price }),
            ...(e.soldOut !== undefined && { soldOut: e.soldOut }),
            ...(e.tickets && { tickets: e.tickets }),
            ...(e.email && { contactEmail: e.email }),
            ...(e.phone && { contactPhone: e.phone }),
            poster: { art: `poster-${e.id}` },
            description:
                e.description[1] === undefined
                    ? { fr: e.description[0] }
                    : t(e.description[0], e.description[1]),
            tags: e.tags
        }
    };
});

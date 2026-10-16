import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';

/**
 * Five issues ran from 1968 to 1978. Around them: the pilot "numéro zéro" that was printed
 * for the founders and then pulled, and a special issue on the SIGNAL series, in preparation.
 */
export type IssueInfo = {
    id: string;
    number: string;
    n: number;
    name: [string, string];
    theme: [string, string];
    season: 'hiver' | 'printemps' | 'ete' | 'automne';
    year: number;
    publishedOn: string;
    dateline: string;
    motif: string;
    palette: string;
    price: number;
    print: boolean;
    intro: [string, string];
    contents: string[];
    featured?: string[];
    state?: SourceEntry['state'];
    daysAgo: number;
    scheduleInDays?: number;
};

export const ISSUES: IssueInfo[] = [
    {
        id: 'issue-00',
        number: '00',
        n: 0,
        name: ['Numéro zéro', 'Issue Zero'],
        theme: ['Le pilote', 'The pilot'],
        season: 'automne',
        year: 1968,
        publishedOn: '1968-11-15',
        dateline: 'AUTOMNE 1968',
        motif: 'zero',
        palette: 'archive',
        price: 0,
        print: true,
        intro: [
            'Douze exemplaires, ronéotypés, pour les fondateurs et leurs familles. Retiré de la circulation après une coquille dans le titre.',
            'Twelve mimeographed copies, for the founders and their families. Withdrawn after a typo in the masthead.'
        ],
        contents: [
            'Pourquoi un journal? — Henri Beaumont',
            'Le garage, plan au sol — Yves Lalonde'
        ],
        state: 'unpublished',
        daysAgo: 140
    },
    {
        id: 'issue-01',
        number: '01',
        n: 1,
        name: ['L’Aube', 'The Dawn'],
        theme: ['Les débuts', 'Beginnings'],
        season: 'hiver',
        year: 1968,
        publishedOn: '1968-12-20',
        dateline: 'HIVER 1968',
        motif: 'dawn',
        palette: 'maison',
        price: 0.75,
        print: true,
        intro: [
            'Le premier numéro. L’hiver 1968. Un garage. Trois fondateurs. Le début de tout.',
            'The first issue. Winter 1968. A garage. Three founders. The beginning of everything.'
        ],
        contents: [
            'Nous avons commencé dans un garage à Montréal',
            'Diane Tremblay: l’architecte de l’intelligence',
            'La Chose: notes sur le premier prototype'
        ],
        featured: ['issue-01-1', 'issue-01-2'],
        daysAgo: 135
    },
    {
        id: 'issue-02',
        number: '02',
        n: 2,
        name: ['La Maison', 'The Home'],
        theme: ['Vivre avec une machine', 'Living with a machine'],
        season: 'printemps',
        year: 1971,
        publishedOn: '1971-04-02',
        dateline: 'PRINTEMPS 1971',
        motif: 'home',
        palette: 'maison',
        price: 0.75,
        print: true,
        intro: [
            'Le foyer. Là où tout commence. Six mois avec un MAISON-3 pour comprendre ce que signifie vivre avec une machine qui apprend.',
            'The home. Where it all begins. Six months with a MAISON-3 to understand what it means to live with a machine that learns.'
        ],
        contents: ['Six mois avec le MAISON-3', 'Peut-on faire confiance à une machine?'],
        featured: ['issue-02-1'],
        daysAgo: 132
    },
    {
        id: 'issue-03',
        number: '03',
        n: 3,
        name: ['L’Usine', 'The Factory'],
        theme: ['Le travail', 'Work'],
        season: 'ete',
        year: 1973,
        publishedOn: '1973-07-10',
        dateline: 'ÉTÉ 1973',
        motif: 'factory',
        palette: 'industrie',
        price: 1,
        print: true,
        intro: [
            'À trois heures du matin, l’usine est aussi lumineuse qu’en plein jour. Les unités INDUSTRIE-F ne dorment jamais.',
            'At three in the morning, the factory is as bright as midday. The INDUSTRIE-F units never sleep.'
        ],
        contents: ['L’usine qui ne dort jamais', 'INDUSTRIE-X: ce que nous pouvons dire'],
        featured: ['issue-03-1'],
        daysAgo: 129
    },
    {
        id: 'issue-04',
        number: '04',
        n: 4,
        name: ['Le Compagnon', 'The Bond'],
        theme: ['L’attachement', 'Attachment'],
        season: 'automne',
        year: 1977,
        publishedOn: '1977-10-14',
        dateline: 'AUTOMNE 1977',
        motif: 'bond',
        palette: 'compagnon',
        price: 1.25,
        print: true,
        intro: [
            'Huit mille deux cent quarante-trois noms sur la liste. Quatre ans d’attente. Et parfois, une mise hors service qui ressemble à un deuil.',
            'Eight thousand two hundred and forty-three names on the list. Four years of waiting. And sometimes, a decommissioning that feels like a loss.'
        ],
        contents: ['La liste d’attente', 'COMPAGNON-1: une nécrologie'],
        featured: ['issue-04-1', 'issue-04-2'],
        daysAgo: 126
    },
    {
        id: 'issue-05',
        number: '05',
        n: 5,
        name: ['L’Horizon', 'The Edge'],
        theme: ['Plus loin', 'Further'],
        season: 'hiver',
        year: 1978,
        publishedOn: '1978-02-28',
        dateline: 'HIVER 1978',
        motif: 'edge',
        palette: 'horizon',
        price: 1.5,
        print: true,
        intro: [
            'Le dernier numéro. 1978. Le fond de l’océan. Paris. L’infini. Et une architecte qui n’a pas fini son histoire.',
            'The final issue. 1978. The ocean floor. Paris. Infinity. And an architect who has not finished her story.'
        ],
        contents: [
            'HORIZON-E: rapport du fond de l’océan',
            'Pourquoi Paris a interdit les androïdes',
            'HORIZON-∞',
            'L’architecte qui ne travaille qu’avec des robots'
        ],
        featured: ['issue-05-1', 'issue-05-2', 'issue-05-4'],
        daysAgo: 122
    },
    {
        id: 'hors-serie-signal',
        number: 'HS',
        n: 6,
        name: ['Hors-série: Le Signal', 'Special: The Signal'],
        theme: ['Ce qui vient', 'What comes next'],
        season: 'printemps',
        year: 1979,
        publishedOn: '1979-04-20',
        dateline: 'PRINTEMPS 1979',
        motif: 'signal',
        palette: 'signal',
        price: 2,
        print: false,
        intro: [
            'Un numéro spécial, un an après la fin. La série SIGNAL, Sept-Îles, et une question: qui écoute?',
            'A special issue, a year after the end. The SIGNAL series, Sept-Îles, and one question: who is listening?'
        ],
        contents: ['En préparation'],
        state: 'draft',
        daysAgo: 20
    }
];

export const issues: SourceEntry[] = ISSUES.map((i, order) => ({
    id: i.id,
    daysAgo: i.daysAgo,
    by: who('louise'),
    state: i.state,
    scheduleInDays: i.scheduleInDays,
    data: {
        number: i.n,
        name: t(...i.name),
        slug: t(i.number.toLowerCase(), i.number.toLowerCase()),
        theme: t(...i.theme),
        season: i.season,
        year: i.year,
        publishedOn: i.publishedOn,
        intro: t(...i.intro),
        cover: { art: `cover-${i.id}` },
        ...(i.print && { printEdition: { art: `print-${i.id}` } }),
        price: i.price,
        ...(i.featured && { featured: i.featured }),
        order
    }
}));

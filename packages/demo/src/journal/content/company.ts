import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';
import { isoInDays } from '../../runtime/clock.js';

/** Press releases, job openings, FAQ and site settings. */

const release = (
    id: string,
    date: string,
    title: [string, string],
    summary: [string, string],
    body: [string, string?],
    extra: Partial<SourceEntry> & { attachments?: string[] } = {}
): SourceEntry => {
    const { attachments, ...entry } = extra;
    return {
        id,
        daysAgo: 100,
        by: who('louise'),
        ...entry,
        data: {
            title: t(...title),
            slug: t(id, id),
            date,
            summary: t(...summary),
            body: body[1] === undefined ? { fr: body[0] } : t(body[0], body[1]),
            ...(attachments && { attachments: attachments.map(art => ({ art })) }),
            contact: 'presse@moteur-journal.test'
        }
    };
};

export const pressReleases: SourceEntry[] = [
    release(
        'fondation',
        '1968-03-01',
        ['Fondation de Moteur Industries S.A.', 'Moteur Industries S.A. is founded'],
        [
            'Trois ingénieurs, un garage, une ambition.',
            'Three engineers, one garage, one ambition.'
        ],
        [
            '# Moteur Industries S.A.\n\n**Montréal, 1er mars 1968.** Henri Beaumont, Yves Lalonde et un troisième associé qui souhaite rester anonyme fondent *Moteur Industries S.A.*\n\n- Capital: 4 000 $\n- Siège: 4572, rue Saint-Denis\n- Employés: 3',
            '# Moteur Industries S.A.\n\n**Montréal, March 1, 1968.** Henri Beaumont, Yves Lalonde and a third partner who wishes to remain anonymous found *Moteur Industries S.A.*\n\n- Capital: $4,000\n- Head office: 4572 Rue Saint-Denis\n- Employees: 3'
        ],
        { daysAgo: 125 }
    ),
    release(
        'memoire-contextuelle',
        '1970-09-15',
        [
            'La mémoire contextuelle arrive dans toutes les unités',
            'Contextual memory comes to every unit'
        ],
        ['Une invention de Diane Tremblay.', 'Invented by Diane Tremblay.'],
        [
            'La **mémoire contextuelle** permet à une unité de se souvenir des préférences de son foyer pendant 30 jours.\n\n> « Elle ne se souvient pas de tout. Elle se souvient de ce qui compte. » — Diane Tremblay',
            'Contextual memory lets a unit remember its household’s preferences for 30 days.\n\n> "It doesn’t remember everything. It remembers what matters." — Diane Tremblay'
        ],
        { daysAgo: 115 }
    ),
    release(
        'usine-rouyn',
        '1973-01-20',
        ['Ouverture de l’usine de Rouyn-Noranda', 'Rouyn-Noranda plant opens'],
        ['400 emplois, aucune mise à pied.', '400 jobs, no layoffs.'],
        [
            'L’usine Leclerc & Fils accueille la production INDUSTRIE-F. Convention signée avec la section locale 4278.\n\n```\nCapacité: 3 200 unités/an\nQuarts: 3\n```',
            'The Leclerc & Fils plant takes on INDUSTRIE-F production. Agreement signed with Local 4278.\n\n```\nCapacity: 3,200 units/year\nShifts: 3\n```'
        ],
        { daysAgo: 105, attachments: ['scene-factory', 'press-kit'] }
    ),
    release(
        'resultats-1977',
        '1978-01-31',
        ['Résultats 1977', '1977 results'],
        ['Chiffre d’affaires en hausse de 31 %.', 'Revenue up 31%.'],
        [
            '| Indicateur | 1976 | 1977 |\n|---|---|---|\n| Unités livrées | 8 100 | 10 600 |\n| Pays | 10 | 12 |\n| Liste d’attente COMPAGNON-9 | — | 8 243 |',
            '| Indicator | 1976 | 1977 |\n|---|---|---|\n| Units delivered | 8,100 | 10,600 |\n| Countries | 10 | 12 |\n| COMPAGNON-9 waiting list | — | 8,243 |'
        ],
        {
            daysAgo: 40,
            attachments: ['chart-units', 'press-kit'],
            state: 'edited',
            edits: [
                {
                    by: who('louise'),
                    daysAgo: 1,
                    data: {
                        summary: t(
                            'Chiffre d’affaires en hausse de 31 % (chiffres vérifiés).',
                            'Revenue up 31% (audited figures).'
                        )
                    }
                }
            ]
        }
    ),
    release(
        'signal-annonce',
        '1979-04-20',
        ['Moteur annonce la série SIGNAL', 'Moteur announces the SIGNAL series'],
        ['Embargo jusqu’au lancement.', 'Embargoed until launch.'],
        ['EMBARGO. Ne pas diffuser avant le 20 avril 1979.'],
        { daysAgo: 8, state: 'in-review', review: { reviewer: who('louise') } }
    ),
    release(
        'industrie-x',
        '1977-06-01',
        ['Au sujet de l’INDUSTRIE-X', 'Regarding the INDUSTRIE-X'],
        ['Aucun commentaire.', 'No comment.'],
        [
            'Moteur Industries ne commente pas les rumeurs.',
            'Moteur Industries does not comment on rumours.'
        ],
        { daysAgo: 80, state: 'unpublished' }
    )
];

const job = (
    id: string,
    title: [string, string],
    department: string,
    employment: string,
    city: [string, string, string],
    salary: [number, number] | null,
    closesInDays: number,
    description: [string, string],
    extra: Partial<SourceEntry> & { remote?: boolean } = {}
): SourceEntry => {
    const { remote, ...entry } = extra;
    return {
        id,
        daysAgo: 35,
        by: who('louise'),
        ...entry,
        data: {
            title: t(...title),
            slug: t(id, id),
            department,
            employment,
            location: {
                street: city[0],
                city: city[1],
                state: 'QC',
                country: 'CA',
                postalCode: city[2]
            },
            remote: remote ?? false,
            ...(salary && { salaryMin: salary[0], salaryMax: salary[1] }),
            closesOn: isoInDays(closesInDays).slice(0, 10),
            description: t(...description),
            apply: {
                url: `mailto:emplois@moteur-journal.test?subject=${id}`,
                label: 'Postuler / Apply'
            }
        }
    };
};

const MTL: [string, string, string] = ['400, rue Notre-Dame Ouest', 'Montréal', 'H2Y 1V3'];

export const jobs: SourceEntry[] = [
    job(
        'journaliste-tech',
        ['Journaliste, technologie', 'Technology journalist'],
        'editorial',
        'full-time',
        MTL,
        [14000, 18000],
        21,
        [
            'Vous écrivez vite, juste, et dans les deux langues.',
            'You write fast, accurately, and in both languages.'
        ],
        { remote: true }
    ),
    job(
        'traducteur',
        ['Traducteur·rice FR → EN', 'FR → EN translator'],
        'editorial',
        'part-time',
        MTL,
        [8000, 9500],
        14,
        ['Pour soulager Jean-François.', 'To give Jean-François a break.']
    ),
    job(
        'ingenieure-memoire',
        ['Ingénieur·e, mémoire contextuelle', 'Engineer, contextual memory'],
        'engineering',
        'full-time',
        MTL,
        [22000, 30000],
        30,
        [
            'Dans l’équipe de Diane Tremblay. Mathématiques exigées; patience aussi.',
            'On Diane Tremblay’s team. Maths required; so is patience.'
        ]
    ),
    job(
        'technicien-nuit',
        ['Technicien·ne de nuit', 'Night technician'],
        'factory',
        'full-time',
        ['75, avenue Dallaire', 'Rouyn-Noranda', 'J9X 4T5'],
        [12500, 14000],
        7,
        [
            'Quart de 23 h à 7 h. Les robots ne parlent pas beaucoup.',
            '11 p.m. to 7 a.m. shift. The robots don’t talk much.'
        ]
    ),
    job(
        'plongeur-expedition',
        ['Plongeur·se d’expédition', 'Expedition diver'],
        'expeditions',
        'contract',
        ['1, quai Mgr-Blanche', 'Sept-Îles', 'G4R 5P3'],
        null,
        45,
        [
            'Accompagner les unités HORIZON en surface. Brevet exigé.',
            'Accompany HORIZON units at the surface. Certification required.'
        ]
    ),
    job(
        'service-clientele',
        ['Conseiller·ère, service à la clientèle', 'Customer care advisor'],
        'customer-care',
        'full-time',
        MTL,
        [9000, 11000],
        10,
        [
            'Rassurer les propriétaires de COMPAGNON qui appellent « juste pour savoir si elle va bien ».',
            'Reassure COMPAGNON owners who call "just to check she’s all right".'
        ]
    ),
    job(
        'stagiaire-photo',
        ['Stagiaire, photographie', 'Photography intern'],
        'editorial',
        'part-time',
        MTL,
        null,
        -5,
        [
            'Poste pourvu. Merci à toutes les candidatures.',
            'Position filled. Thank you to all applicants.'
        ],
        { state: 'unpublished' }
    ),
    job(
        'directeur-signal',
        ['Direction, programme SIGNAL', 'Director, SIGNAL programme'],
        'engineering',
        'full-time',
        ['1, quai Mgr-Blanche', 'Sept-Îles', 'G4R 5P3'],
        [35000, 45000],
        60,
        ['Confidentiel jusqu’à l’annonce.', 'Confidential until the announcement.'],
        { state: 'draft', daysAgo: 3 }
    )
];

const faqItem = (
    id: string,
    order: number,
    question: [string, string],
    answer: [string, string?],
    topics: string[],
    extra: Partial<SourceEntry> = {}
): SourceEntry => ({
    id,
    daysAgo: 50 - order,
    by: who('marguerite'),
    ...extra,
    data: {
        question: t(...question),
        answer: answer[1] === undefined ? { fr: answer[0] } : t(answer[0], answer[1]),
        topics,
        order
    }
});

export const faq: SourceEntry[] = [
    faqItem(
        'liste-attente',
        0,
        [
            'Combien de temps faut-il attendre un COMPAGNON-9?',
            'How long is the wait for a COMPAGNON-9?'
        ],
        [
            'Quatre ans et deux mois en moyenne. Voir notre [rectificatif](/fr/rectificatif-compagnon-9).',
            'Four years and two months on average. See our [correction](/en/correction-compagnon-9).'
        ],
        ['enquete']
    ),
    faqItem(
        'oublier',
        1,
        [
            'Comment faire oublier quelque chose à ma MAISON?',
            'How do I make my MAISON forget something?'
        ],
        [
            'Dites « Trois, oublie », suivi de ce qu’elle doit oublier.',
            'Say "Three, forget", followed by what it should forget.'
        ],
        ['technique']
    ),
    faqItem(
        'chat',
        2,
        ['Ma MAISON et mon chat ne s’entendent pas.', 'My MAISON and my cat don’t get along.'],
        [
            'C’est normal la première semaine. Ensuite, c’est le chat.',
            'That’s normal in the first week. After that, it’s the cat.'
        ],
        ['reportage']
    ),
    faqItem(
        'garantie',
        3,
        ['Que couvre la garantie de trente ans?', 'What does the thirty-year warranty cover?'],
        [
            'La mémoire et les articulations. Pas la peinture, ni le chagrin.',
            'Memory and joints. Not paint, nor heartbreak.'
        ],
        ['technique']
    ),
    faqItem(
        'industrie-x',
        4,
        ['Qu’est-ce que l’INDUSTRIE-X?', 'What is the INDUSTRIE-X?'],
        ['Nous ne pouvons pas répondre à cette question.', 'We cannot answer this question.'],
        ['communique']
    ),
    faqItem(
        'abonnement',
        5,
        ['Comment m’abonner au Journal?', 'How do I subscribe to the Journal?'],
        [
            'Remplissez le formulaire d’infolettre. Gratuit pour les propriétaires.',
            'Fill in the newsletter form. Free for owners.'
        ],
        []
    ),
    faqItem(
        'ecrire',
        6,
        ['Puis-je écrire pour le Journal?', 'Can I write for the Journal?'],
        ['Oui. Lisez d’abord le guide du rédacteur.', 'Yes. Read the writer’s guide first.'],
        ['essai']
    ),
    faqItem(
        'robots-auteurs',
        7,
        ['Les robots écrivent-ils vraiment des articles?', 'Do robots really write articles?'],
        [
            'Oui. Unit 7-PASCAL signe ses textes. Ils sont relus comme les autres.',
            'Yes. Unit 7-PASCAL signs its pieces. They are edited like everyone else’s.'
        ],
        ['portrait']
    ),
    faqItem(
        'paris',
        8,
        ['Puis-je voyager à Paris avec mon COMPAGNON?', 'Can I travel to Paris with my COMPAGNON?'],
        ['Non, pas depuis 1977.', 'No, not since 1977.'],
        ['opinion']
    ),
    faqItem(
        'horizon',
        9,
        ['Les particuliers peuvent-ils acheter un HORIZON?', 'Can individuals buy a HORIZON?'],
        [
            'En théorie. Il coûte 380 000 $ et pèse deux tonnes.',
            'In theory. It costs $380,000 and weighs two tonnes.'
        ],
        ['expedition']
    ),
    faqItem(
        'recyclage',
        10,
        ['Que devient une unité en fin de vie?', 'What happens to a unit at the end of its life?'],
        [
            'Nous la reprenons. Ses souvenirs sont effacés, sauf si vous demandez de les garder.',
            'We take it back. Its memories are wiped, unless you ask to keep them.'
        ],
        ['memoire']
    ),
    faqItem(
        'langues',
        11,
        ['Quelles langues parlent les unités?', 'Which languages do the units speak?'],
        ['Français et anglais. L’espagnol arrive en 1979.'],
        ['technique']
    ),
    faqItem(
        'visites',
        12,
        ['Peut-on visiter l’usine?', 'Can I visit the plant?'],
        [
            'Oui, lors des portes ouvertes. Consultez les événements.',
            'Yes, at open houses. Check the events.'
        ],
        ['reportage']
    ),
    faqItem(
        'signal',
        13,
        ['Qu’est-ce que la série SIGNAL?', 'What is the SIGNAL series?'],
        ['Annonce prévue au printemps.', 'Announcement planned for spring.'],
        ['technique'],
        { state: 'draft', daysAgo: 4 }
    ),
    faqItem(
        'vide',
        14,
        ['Une question sans réponse?', 'A question without an answer?'],
        ['(Réponse à venir.)'],
        [],
        { state: 'draft', daysAgo: 1 }
    )
];

export const settings: SourceEntry[] = [
    {
        id: 'site',
        daysAgo: 145,
        by: who('theo'),
        data: {
            siteName: 'Moteur Journal',
            tagline: t(
                'Le magazine de Moteur Industries, depuis 1968.',
                'The magazine of Moteur Industries, since 1968.'
            ),
            logo: { art: 'logo' },
            primaryColor: '#d8622b',
            contactEmail: 'redaction@moteur-journal.test',
            phone: '+1 514 555 0168',
            address: {
                street: '400, rue Notre-Dame Ouest',
                city: 'Montréal',
                state: 'QC',
                country: 'CA',
                postalCode: 'H2Y 1V3'
            },
            openingHours: [
                {
                    days: t('Lundi au vendredi', 'Monday to Friday'),
                    opens: '09:00',
                    closes: '17:00'
                },
                { days: t('Samedi', 'Saturday'), opens: '10:00', closes: '14:00' }
            ],
            social: [
                { url: 'https://radio.moteur.test/journal', label: 'Radio' },
                { url: 'https://telex.moteur.test/05-24871', label: 'Telex' }
            ],
            announcement: {
                enabled: true,
                message: t('Hors-série SIGNAL: bientôt.', 'SIGNAL special issue: coming soon.'),
                link: { url: '/fr/hors-serie', label: 'En savoir plus' }
            },
            footer: {
                html: t(
                    '<p>© 1968–1979 Moteur Industries S.A. <a href="/fr/confidentialite">Confidentialité</a></p>',
                    '<p>© 1968–1979 Moteur Industries S.A. <a href="/en/privacy">Privacy</a></p>'
                )
            },
            homeLayout: { layoutId: 'home-layout', slots: [] },
            defaultSeo: {
                seoTitle: 'Moteur Journal',
                seoDescription: 'Le magazine bilingue de Moteur Industries, Montréal, 1968–1978.'
            },
            analytics: { provider: 'none', anonymizeIp: true, sampleRate: 0.1 },
            workflowStatus: 'published',
            maintenance: false
        },
        edits: [{ by: who('theo'), daysAgo: 1, data: { primaryColor: '#c0392b' } }],
        state: 'edited'
    }
];

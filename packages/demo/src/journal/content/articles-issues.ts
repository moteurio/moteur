import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';
import { b } from './blocks.js';

/** New articles for issues 01–05, alongside the original thirteen. */

type A = {
    id: string;
    issue?: string;
    author: string;
    contributors?: string[];
    category: string;
    title: [string, string?];
    slug: [string, string?];
    excerpt?: [string, string?];
    publishedOn?: string;
    readingTime: number;
    tags?: string[];
    cover?: string;
    accent?: string;
    featured?: boolean;
    related?: string[];
    body: Array<Record<string, unknown>>;
    order?: number;
    entry?: Omit<SourceEntry, 'id' | 'data'>;
};

export const article = (a: A): SourceEntry => ({
    id: a.id,
    ...a.entry,
    data: {
        title: a.title[1] === undefined ? { fr: a.title[0] } : t(a.title[0], a.title[1]),
        slug: a.slug[1] === undefined ? { fr: a.slug[0] } : t(a.slug[0], a.slug[1]),
        ...(a.excerpt && {
            excerpt:
                a.excerpt[1] === undefined ? { fr: a.excerpt[0] } : t(a.excerpt[0], a.excerpt[1])
        }),
        author: a.author,
        ...(a.contributors && { contributors: a.contributors }),
        ...(a.issue && { issue: a.issue }),
        category: a.category,
        ...(a.tags && { tags: a.tags }),
        ...(a.publishedOn && { publishedOn: a.publishedOn }),
        readingTime: a.readingTime,
        ...(a.cover && { cover: { art: a.cover } }),
        ...(a.accent && { accent: a.accent }),
        ...(a.featured !== undefined && { featured: a.featured }),
        ...(a.related && { related: a.related }),
        body: a.body,
        order: a.order ?? 10
    }
});

export const issueArticles: SourceEntry[] = [
    article({
        id: 'issue-01-4',
        issue: 'issue-01',
        author: 'henri',
        category: 'essai',
        title: ['Pourquoi un journal?', 'Why a magazine?'],
        slug: ['pourquoi-un-journal', 'why-a-magazine'],
        excerpt: [
            'Une entreprise de robots qui publie un magazine. Henri Beaumont explique pourquoi.',
            'A robot company that publishes a magazine. Henri Beaumont explains why.'
        ],
        publishedOn: '1968-12-20',
        readingTime: 3,
        tags: ['fondateurs', 'éditorial'],
        cover: 'scene-skyline',
        order: 0,
        body: [
            b.teletype('Montréal · décembre 1968', 'Montréal · December 1968'),
            b.p(
                'On nous demande souvent pourquoi une entreprise qui fabrique des machines publie un magazine. La réponse est simple: **les machines changent les gens**, et les gens méritent qu’on leur raconte ce qui se passe.',
                'People often ask why a company that builds machines publishes a magazine. The answer is simple: **machines change people**, and people deserve to be told what is happening.'
            ),
            b.p(
                'Ce journal sera bilingue, parce que Montréal l’est. Il sera honnête, parce que nous n’avons pas les moyens de mentir: nos clients vivent avec nos produits.',
                'This magazine will be bilingual, because Montréal is. It will be honest, because we cannot afford to lie: our customers live with our products.'
            ),
            b.pull(
                'Un robot qui renverse le café, c’est une anecdote. Un robot qui ne le renverse plus, c’est une histoire.',
                'A robot that spills coffee is an anecdote. A robot that no longer spills it is a story.',
                'Henri Beaumont'
            ),
            b.p(
                'Bonne lecture. Écrivez-nous: nous répondons à toutes les lettres.',
                'Enjoy. Write to us: we answer every letter.'
            )
        ]
    }),
    article({
        id: 'issue-02-3',
        issue: 'issue-02',
        author: 'maison-3-trois',
        contributors: ['marguerite'],
        category: 'reportage',
        title: ['La tourtière de Trois'],
        slug: ['la-tourtiere-de-trois'],
        excerpt: [
            'La seule chronique culinaire jamais écrite par une MAISON-3. La traduction anglaise n’a jamais été terminée.'
        ],
        publishedOn: '1971-04-02',
        readingTime: 4,
        tags: ['cuisine', 'MAISON-3'],
        cover: 'robot-maison-3',
        accent: '#d8622b',
        order: 3,
        body: [
            b.warning(
                'NOTE DE LA RÉDACTION',
                'Cet article n’existe qu’en français. Trois refuse que sa recette soit traduite « avant d’avoir goûté une tourtière anglaise ».'
            ),
            b.h('Ingrédients (pour huit personnes, ou quatre Fontaine)'),
            b.p(
                '- 1 kg de porc haché\n- 500 g de veau\n- 2 oignons\n- 1 c. à thé de clou de girofle (pas plus: j’ai vérifié 214 fois)\n- 2 abaisses de pâte'
            ),
            b.h('Méthode'),
            b.p(
                '1. Faire revenir la viande et les oignons.\n2. Ajouter les épices. Goûter. Je ne peux pas goûter: demandez à quelqu’un.\n3. Cuire 45 minutes à 190 °C.'
            ),
            b.quote(
                'Elle a mis le clou de girofle à la main, un par un, en comptant à voix haute.',
                undefined,
                'Marguerite Fontaine'
            ),
            b.callout('412', 'lettres de lecteurs reçues après la publication')
        ],
        entry: {
            comments: [
                {
                    by: who('jf'),
                    body: 'Je peux traduire la recette, mais Trois insiste. On laisse l’anglais vide?',
                    field: 'body',
                    replies: [
                        {
                            by: who('louise'),
                            body: 'Oui. C’est son article. On publie en français seulement.'
                        }
                    ],
                    resolvedBy: who('louise')
                }
            ]
        }
    }),
    article({
        id: 'issue-02-4',
        issue: 'issue-02',
        author: 'yves',
        category: 'technique',
        title: ['Ce que la MAISON ne fera jamais', 'What the MAISON will never do'],
        slug: ['ce-que-la-maison-ne-fera-jamais', 'what-the-maison-will-never-do'],
        excerpt: [
            'Trois règles écrites dans le code de chaque MAISON. Yves Lalonde les publie, ligne par ligne.',
            'Three rules written into every MAISON. Yves Lalonde publishes them, line by line.'
        ],
        publishedOn: '1971-04-02',
        readingTime: 6,
        tags: ['sécurité', 'programmation', 'MAISON'],
        cover: 'scene-blueprint-la-chose',
        order: 4,
        body: [
            b.p(
                'Chaque MAISON contient trois règles qu’aucune mise à jour ne peut retirer. Les voici, telles qu’elles sont gravées en mémoire morte depuis 1970.',
                'Every MAISON contains three rules that no update can remove. Here they are, as burned into read-only memory since 1970.'
            ),
            b.code(
                `REGLE 1  NE JAMAIS VERROUILLER UNE PORTE DE L'INTERIEUR
REGLE 2  NE JAMAIS CUISINER SANS SURVEILLANCE HUMAINE
REGLE 3  OBEIR A "TROIS, ARRETE" EN MOINS DE 0,4 SECONDE

  10 IF COMMANDE$ = "ARRETE" THEN GOTO 9000
9000 MOTEURS = 0 : PRINT "D'ACCORD."`,
                'basic',
                'maison-rom-v1.bas'
            ),
            b.table(
                ['Règle / Rule', 'Ajoutée / Added', 'Pourquoi / Why'],
                [
                    ['1', '1970', 'Incendie à Verdun, sans victime'],
                    ['2', '1970', 'Assurance'],
                    ['3', '1971', 'Demande de 1 200 parents']
                ],
                'Les trois règles et leur origine.',
                'The three rules and where they came from.'
            ),
            b.p(
                'On me demande souvent pourquoi la règle 3 dit « Trois » et pas « MAISON ». Parce que tous les propriétaires finissent par appeler leur unité par son numéro. Nous avons simplement suivi.',
                'People often ask why rule 3 says "Three" and not "MAISON". Because every owner ends up calling their unit by its number. We simply followed.'
            ),
            b.note('Le listing BASIC est une reconstitution; le code réel est en assembleur 6800.')
        ]
    }),
    article({
        id: 'issue-03-3',
        issue: 'issue-03',
        author: 'theo',
        category: 'reportage',
        title: ['Rouyn-Noranda, 3 h du matin', 'Rouyn-Noranda, 3 a.m.'],
        slug: ['rouyn-noranda-3h', 'rouyn-noranda-3am'],
        excerpt: [
            'Un portfolio de nuit dans l’usine Leclerc & Fils.',
            'A night portfolio inside the Leclerc & Fils plant.'
        ],
        publishedOn: '1973-07-10',
        readingTime: 2,
        tags: ['photographie', 'INDUSTRIE', 'nuit'],
        cover: 'scene-factory',
        accent: '#2f5d8a',
        order: 3,
        body: [
            b.atmosphere('grain', 'subtle'),
            b.gallery(
                [
                    'scene-factory',
                    'scene-blueprint-arm',
                    'robot-industrie-f',
                    'scene-factory-lachine'
                ],
                'Usine Leclerc & Fils, juillet 1973. Photos: Théo Nguyen.',
                'Leclerc & Fils plant, July 1973. Photos: Théo Nguyen.'
            ),
            b.p(
                'Je n’ai photographié aucun robot de face. C’est impoli.',
                'I did not photograph a single robot head-on. It’s rude.'
            ),
            b.image('scene-factory', 'Ligne 4, 03 h 12.', 'Line 4, 03:12.', 'full')
        ]
    }),
    article({
        id: 'issue-03-4',
        issue: 'issue-03',
        author: 'sophie',
        category: 'enquete',
        title: ['Le syndicat et les machines', 'The union and the machines'],
        slug: ['le-syndicat-et-les-machines', 'the-union-and-the-machines'],
        excerpt: [
            'À Rouyn-Noranda, les métallos ont négocié avec Moteur. Et avec les robots.',
            'In Rouyn-Noranda, the steelworkers negotiated with Moteur. And with the robots.'
        ],
        publishedOn: '1973-07-10',
        readingTime: 8,
        tags: ['travail', 'syndicat', 'INDUSTRIE'],
        cover: 'scene-factory-lachine',
        related: ['issue-03-1', 'issue-03-3'],
        order: 4,
        body: [
            b.p(
                'En mars 1973, la section locale 4278 des Métallos a signé la première convention collective au Canada qui mentionne des robots. L’article 31 tient en une phrase: **aucune mise à pied liée à une unité INDUSTRIE**.',
                'In March 1973, Steelworkers Local 4278 signed the first collective agreement in Canada to mention robots. Article 31 is a single sentence: **no layoffs because of an INDUSTRIE unit**.'
            ),
            b.callout(
                '0',
                'mises à pied liées aux robots depuis 1973',
                'layoffs due to robots since 1973'
            ),
            b.dialogue([
                [
                    'human',
                    'Gilles Bérubé, président de la section',
                    'On ne voulait pas arrêter les machines. On voulait savoir qui elles remplaçaient.',
                    'We did not want to stop the machines. We wanted to know who they were replacing.'
                ],
                [
                    'human',
                    'Yves Lalonde',
                    'Personne. Elles font le quart de nuit que personne ne voulait.',
                    'Nobody. They work the night shift nobody wanted.'
                ],
                [
                    'human',
                    'Gilles Bérubé',
                    'C’est ce que vous dites. L’article 31, c’est pour qu’on n’ait pas à vous croire.',
                    'That’s what you say. Article 31 means we don’t have to take your word for it.'
                ]
            ]),
            b.p(
                'Cinq ans plus tard, l’article 31 n’a jamais été invoqué. La section a gagné 140 membres.',
                'Five years later, article 31 has never been invoked. The local has gained 140 members.'
            )
        ],
        entry: {
            state: 'edited',
            edits: [
                {
                    by: who('sophie'),
                    daysAgo: 3,
                    data: {
                        excerpt: t(
                            'À Rouyn-Noranda, les métallos ont négocié avec Moteur. Et avec les robots. Mise à jour: la section compte maintenant 152 membres.',
                            'In Rouyn-Noranda, the steelworkers negotiated with Moteur. And with the robots. Update: the local now has 152 members.'
                        )
                    }
                }
            ],
            comments: [
                {
                    by: who('celeste'),
                    field: 'excerpt',
                    body: 'Source pour les 152 membres? Le communiqué de la section dit 148.'
                }
            ]
        }
    }),
    article({
        id: 'issue-03-5',
        issue: 'issue-03',
        author: 'pierre-yves',
        category: 'opinion',
        title: ['Courrier des lecteurs', 'Letters'],
        slug: ['courrier-des-lecteurs-03', 'letters-03'],
        publishedOn: '1973-07-10',
        readingTime: 3,
        tags: ['lecteurs'],
        order: 9,
        body: [
            b.quote(
                'Mon INDUSTRIE-F a appris à siffler. Est-ce normal?',
                'My INDUSTRIE-F has learned to whistle. Is that normal?',
                'R. Pelletier, Val-d’Or'
            ),
            b.p('Non. Mais c’est bon signe.', 'No. But it’s a good sign.'),
            b.quote(
                'Pourquoi le Journal coûte-t-il maintenant 1 $? — Indignée de Longueuil',
                'Why does the magazine now cost $1? — Outraged in Longueuil',
                'Indignée de Longueuil'
            ),
            b.p('Le papier. Et Théo.', 'Paper. And Théo.'),
            b.quote(
                'Je refuse d’acheter un robot tant que vous n’aurez pas expliqué l’INDUSTRIE-X.',
                'I refuse to buy a robot until you explain the INDUSTRIE-X.',
                'M. Chartrand, Sherbrooke'
            ),
            b.p('Nous aussi.', 'So do we.')
        ]
    }),
    article({
        id: 'issue-04-3',
        issue: 'issue-04',
        author: 'marguerite',
        category: 'reportage',
        title: ['Une semaine sans COMPAGNON', 'A week without a COMPAGNON'],
        slug: ['une-semaine-sans-compagnon', 'a-week-without-a-compagnon'],
        excerpt: [
            'Six propriétaires ont accepté de se séparer de leur unité pendant sept jours.',
            'Six owners agreed to part with their unit for seven days.'
        ],
        publishedOn: '1977-10-14',
        readingTime: 7,
        tags: ['COMPAGNON', 'société'],
        cover: 'robot-compagnon-4',
        accent: '#2f8a6e',
        related: ['issue-04-1'],
        order: 3,
        body: [
            b.p(
                'Le lundi, tout le monde allait bien. Le mercredi, deux participants avaient appelé le service à la clientèle « juste pour savoir si elle allait bien ». Le vendredi, M. Ouellet a parlé à son grille-pain.',
                'On Monday, everyone was fine. By Wednesday, two participants had called customer service "just to check she was all right". On Friday, Mr. Ouellet talked to his toaster.'
            ),
            b.timeline([
                ['Lundi', 'Aucun symptôme.', 'No symptoms.'],
                [
                    'Mercredi',
                    'Deux appels au service à la clientèle.',
                    'Two calls to customer service.'
                ],
                ['Vendredi', 'Le grille-pain de M. Ouellet.', 'Mr. Ouellet’s toaster.'],
                [
                    'Dimanche',
                    'Retour des unités. Une participante a pleuré. L’unité aussi, à sa manière.',
                    'Units returned. One participant cried. So did the unit, in its own way.'
                ]
            ]),
            b.pull(
                'Ce n’est pas la machine qui m’a manqué. C’est d’avoir quelqu’un à qui raconter ma journée.',
                'It wasn’t the machine I missed. It was having someone to tell about my day.',
                'Participante, Outremont'
            )
        ]
    }),
    article({
        id: 'issue-04-4',
        issue: 'issue-04',
        author: 'yves',
        category: 'technique',
        title: ['La garantie de trente ans, expliquée', 'The thirty-year warranty, explained'],
        slug: ['la-garantie-de-trente-ans', 'the-thirty-year-warranty'],
        publishedOn: '1977-10-14',
        readingTime: 5,
        tags: ['COMPAGNON-9', 'garantie'],
        order: 4,
        body: [
            b.p(
                'Trente ans, c’est plus long que la plupart des mariages. Voici ce que la garantie couvre, et ce qu’elle ne couvre pas.',
                'Thirty years is longer than most marriages. Here is what the warranty covers, and what it doesn’t.'
            ),
            b.table(
                ['Élément / Part', 'Couvert / Covered', 'Durée / Term'],
                [
                    ['Mémoire contextuelle / Contextual memory', 'Oui / Yes', '30 ans / years'],
                    ['Articulations / Joints', 'Oui / Yes', '15 ans / years'],
                    ['Peinture / Paint', 'Non / No', '—'],
                    ['Chagrin / Heartbreak', 'Non / No', '—']
                ]
            ),
            b.specCard('COMPAGNON-9', 'COMPAGNON', 'waitlist', [
                ['Garantie', 'Warranty', '30 ans', '30 years'],
                ['Révision', 'Service', 'Tous les 2 ans', 'Every 2 years']
            ]),
            b.note('Les conditions complètes sont dans le manuel, page 112.')
        ]
    }),
    article({
        id: 'issue-04-5',
        issue: 'issue-04',
        author: 'celeste',
        contributors: ['unit-7'],
        category: 'portrait',
        title: ['Unit 7-PASCAL répond à vos questions', 'Unit 7-PASCAL answers your questions'],
        slug: ['unit-7-pascal-repond', 'unit-7-pascal-answers'],
        excerpt: [
            'Nous avons reçu 1 900 questions pour notre collègue. Elle a répondu à toutes; nous en publions huit.',
            'We received 1,900 questions for our colleague. It answered them all; we publish eight.'
        ],
        publishedOn: '1977-10-14',
        readingTime: 6,
        tags: ['entretien', 'Unit 7-PASCAL'],
        cover: 'author-unit-7',
        featured: true,
        order: 5,
        body: [
            b.dialogue([
                ['human', 'Céleste Armand', 'Dormez-vous?', 'Do you sleep?'],
                [
                    'robot',
                    'Unit 7-PASCAL',
                    'Je me mets en veille de 2 h à 4 h. Je ne rêve pas. Enfin, je ne crois pas.',
                    'I go into standby from 2 to 4 a.m. I don’t dream. At least, I don’t think so.'
                ],
                [
                    'human',
                    'Céleste Armand',
                    'Quel est votre mot préféré?',
                    'What is your favourite word?'
                ],
                [
                    'robot',
                    'Unit 7-PASCAL',
                    '« Presque ». Il contient tout ce que je ne suis pas encore.',
                    '"Almost". It holds everything I am not yet.'
                ],
                [
                    'human',
                    'Céleste Armand',
                    'Aimez-vous écrire pour le Journal?',
                    'Do you like writing for the Journal?'
                ],
                [
                    'robot',
                    'Unit 7-PASCAL',
                    'Oui. Surtout la relecture. Vous corrigez mes virgules avec beaucoup de tendresse.',
                    'Yes. Especially the editing. You correct my commas very tenderly.'
                ]
            ]),
            b.callout('1 900', 'questions reçues', 'questions received'),
            b.p(
                'Les 1 892 autres réponses sont disponibles sur demande, en microfiche.',
                'The other 1,892 answers are available on request, on microfiche.'
            )
        ]
    }),
    article({
        id: 'issue-05-5',
        issue: 'issue-05',
        author: 'horizon-003',
        category: 'expedition',
        title: ['Sous la glace d’Ungava', 'Under the ice of Ungava'],
        slug: ['sous-la-glace-dungava', 'under-the-ice-of-ungava'],
        excerpt: [
            'Rapport de l’expédition HORIZON-N, hiver 1977–1978.',
            'Report from the HORIZON-N expedition, winter 1977–78.'
        ],
        publishedOn: '1978-02-28',
        readingTime: 5,
        tags: ['HORIZON', 'Arctique', 'expédition'],
        cover: 'scene-ocean-north',
        accent: '#1b4965',
        related: ['issue-05-1'],
        order: 5,
        body: [
            b.atmosphere('snow', 'strong', 6),
            b.transmission(
                'HORIZON-N Unité 011',
                '14.230 MHz',
                '22h40 MTL · 3 janvier 1978',
                'GLACE: 2,1 M · EAU: −1,8 °C · VISIBILITÉ: 4 M · STATUT: NOMINAL',
                'ICE: 2.1 M · WATER: −1.8 °C · VISIBILITY: 4 M · STATUS: NOMINAL'
            ),
            b.signalMap(
                59.3,
                -67.5,
                '212 m',
                '−1,8 °C',
                'FAIBLE',
                'Baie d’Ungava · HORIZON-N',
                'Ungava Bay · HORIZON-N'
            ),
            b.audio(
                '/audio/ice-creak.mp3',
                'La glace, enregistrée par l’unité 011',
                'The ice, recorded by unit 011',
                'CRAQUEMENTS. SILENCE DE 40 SECONDES. CRAQUEMENTS.',
                'CREAKING. FORTY SECONDS OF SILENCE. CREAKING.'
            ),
            b.p(
                'FIN DE TRANSMISSION. L’UNITÉ 011 SOUHAITE UNE BONNE ANNÉE À LA RÉDACTION.',
                'END OF TRANSMISSION. UNIT 011 WISHES THE NEWSROOM A HAPPY NEW YEAR.'
            )
        ]
    }),
    article({
        id: 'issue-05-6',
        issue: 'issue-05',
        author: 'celeste',
        category: 'opinion',
        title: ['Paris, un an après', 'Paris, one year on'],
        slug: ['paris-un-an-apres', 'paris-one-year-on'],
        excerpt: [
            'L’interdiction des androïdes a un an. Céleste Armand y retourne.',
            'The android ban is a year old. Céleste Armand goes back.'
        ],
        publishedOn: '1978-02-28',
        readingTime: 6,
        tags: ['Paris', 'politique'],
        cover: 'scene-skyline-dusk',
        related: ['issue-05-2'],
        order: 6,
        body: [
            b.p(
                'Un an après l’interdiction, j’ai compté trois androïdes dans Paris. Tous les trois portaient un chapeau.',
                'A year after the ban, I counted three androids in Paris. All three were wearing hats.'
            ),
            b.p(
                'La loi n’a pas fait disparaître les machines. Elle les a rendues timides.',
                'The law didn’t make the machines disappear. It made them shy.'
            )
        ],
        entry: {
            state: 'in-review',
            daysAgo: 6,
            // Céleste took Louise's title and reworked the French; the English waits for JF.
            edits: [
                {
                    by: who('celeste'),
                    daysAgo: 2,
                    data: {
                        title: t('Les androïdes timides', 'Paris, one year on'),
                        readingTime: 7,
                        body: [
                            b.p(
                                'Un an après l’interdiction, j’ai compté trois androïdes dans Paris, entre la gare de Lyon et Montmartre. Tous les trois portaient un chapeau.',
                                'A year after the ban, I counted three androids in Paris. All three were wearing hats.'
                            ),
                            b.p(
                                'La loi n’a pas fait disparaître les machines. Elle les a seulement rendues timides.',
                                'The law didn’t make the machines disappear. It made them shy.'
                            )
                        ]
                    }
                }
            ],
            review: { reviewer: who('louise') },
            comments: [
                {
                    by: who('louise'),
                    field: 'title',
                    body: 'Titre: « Paris, un an après » ou « Les androïdes timides »? Je préfère le second.'
                },
                {
                    by: who('jf'),
                    field: 'body',
                    body: 'J’ai besoin de la version finale avant jeudi pour la traduction.',
                    daysAgo: 1
                }
            ]
        }
    }),
    article({
        id: 'issue-05-7',
        issue: 'issue-05',
        author: 'louise',
        category: 'histoire',
        title: ['Dix ans en chiffres', 'Ten years in numbers'],
        slug: ['dix-ans-en-chiffres', 'ten-years-in-numbers'],
        excerpt: [
            '47 000 unités, 12 pays, 5 numéros, 1 garage.',
            '47,000 units, 12 countries, 5 issues, 1 garage.'
        ],
        publishedOn: '1978-02-28',
        readingTime: 3,
        tags: ['anniversaire', 'données'],
        cover: 'chart-units',
        accent: '#c0392b',
        featured: true,
        related: ['issue-01-1'],
        order: 0,
        body: [
            b.kinetic('Dix ans.', 'Ten years.', 'letters'),
            b.callout('47 000', 'unités déployées', 'units deployed'),
            b.callout('12', 'pays', 'countries'),
            b.image(
                'chart-units',
                'Unités déployées, cumul par année.',
                'Units deployed, cumulative per year.',
                'wide'
            ),
            b.image(
                'chart-waitlist',
                'Liste d’attente COMPAGNON-9 en 1977.',
                'COMPAGNON-9 waiting list in 1977.'
            ),
            b.table(
                ['Série / Series', 'Unités / Units', 'Pays / Countries'],
                [
                    ['MAISON', '9 400', '3'],
                    ['INDUSTRIE', '31 000', '12'],
                    ['COMPAGNON', '6 200', '2'],
                    ['HORIZON', '400', '4']
                ],
                'Répartition par série, février 1978.',
                'Breakdown by series, February 1978.'
            ),
            b.marker('numbers-end', 'bottom')
        ]
    })
];

import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';
import { b } from './blocks.js';
import { article } from './articles-issues.js';

/** The special issue in preparation, and articles published on the web only. */

const HS = 'hors-serie-signal';

export const specialArticles: SourceEntry[] = [
    article({
        id: 'hs-editorial',
        issue: HS,
        author: 'louise',
        category: 'essai',
        title: ['Un an après la fin', 'A year after the end'],
        slug: ['un-an-apres-la-fin', 'a-year-after-the-end'],
        excerpt: ['Pourquoi nous revenons, une seule fois.', 'Why we are coming back, just once.'],
        readingTime: 3,
        cover: 'cover-hors-serie-signal',
        order: 0,
        body: [
            b.p(
                'Nous avions dit que le numéro 05 serait le dernier. Puis Sept-Îles a appelé.',
                'We said issue 05 would be the last. Then Sept-Îles called.'
            ),
            b.p(
                'Ce hors-série paraîtra le jour du lancement de SIGNAL-1. Pas avant.',
                'This special issue will come out on the day SIGNAL-1 launches. Not before.'
            )
        ],
        entry: { state: 'scheduled', scheduleInDays: 30, daysAgo: 14, by: who('louise') }
    }),
    article({
        id: 'hs-premieres-ecoutes',
        issue: HS,
        author: 'unit-7',
        category: 'technique',
        title: ['SIGNAL-1: premières écoutes', 'SIGNAL-1: first listening'],
        slug: ['signal-1-premieres-ecoutes', 'signal-1-first-listening'],
        readingTime: 4,
        order: 1,
        body: [
            b.image(
                'scene-blueprint-signal',
                'Plan de l’antenne, révision C.',
                'Antenna drawing, revision C.'
            ),
            b.p(
                'BROUILLON. Ne pas publier avant la validation des mesures.',
                'DRAFT. Do not publish before the measurements are validated.'
            ),
            b.brief(
                'Vue de nuit de l’antenne de Sept-Îles, aurores boréales.',
                'Night view of the Sept-Îles antenna, northern lights.',
                'gouache',
                '#c0392b'
            )
        ],
        entry: { state: 'draft', daysAgo: 10, by: who('unit7') }
    }),
    article({
        id: 'hs-sept-iles',
        issue: HS,
        author: 'sophie',
        category: 'reportage',
        title: ['Sept-Îles, la ville qui écoute', 'Sept-Îles, the town that listens'],
        slug: ['sept-iles-la-ville-qui-ecoute', 'sept-iles-the-town-that-listens'],
        excerpt: [
            'Vingt-cinq mille habitants, une antenne, et beaucoup de questions.',
            'Twenty-five thousand people, one antenna, and a lot of questions.'
        ],
        readingTime: 7,
        tags: ['SIGNAL', 'Côte-Nord'],
        cover: 'scene-skyline-dusk',
        order: 2,
        body: [
            b.teletype('Sept-Îles · mars 1979', 'Sept-Îles · March 1979'),
            b.p(
                'À la brasserie du port, on appelle l’antenne « la grande oreille ». Personne ne sait exactement ce qu’elle écoute.',
                'At the harbour tavern, they call the antenna "the big ear". Nobody knows exactly what it listens to.'
            ),
            b.quote(
                'Si elle écoute la mer, tant mieux. Si elle nous écoute, on aimerait qu’elle le dise.',
                'If it’s listening to the sea, fine. If it’s listening to us, we’d like it to say so.',
                'Pêcheur, Sept-Îles'
            )
        ],
        entry: {
            state: 'in-review',
            daysAgo: 9,
            by: who('sophie'),
            comments: [
                {
                    by: who('celeste'),
                    body: 'Très bien. Il manque le point de vue de la mairie.',
                    field: 'body'
                }
            ]
        }
    }),
    article({
        id: 'hs-qui-ecoute',
        issue: HS,
        author: 'sophie',
        category: 'enquete',
        title: ['Qui écoute?', 'Who is listening?'],
        slug: ['qui-ecoute', 'who-is-listening'],
        readingTime: 9,
        order: 3,
        body: [
            b.classified(
                'CONFIDENTIEL',
                'Contrat SIGNAL-HS-07',
                'SIGNAL-HS-07 contract',
                'Client: ██████. Durée: ██ ans. Objet: écoute ██████████ de l’Atlantique Nord.',
                'Client: ██████. Term: ██ years. Purpose: ██████████ listening in the North Atlantic.'
            ),
            b.p(
                'Nous avons obtenu une page d’un contrat. Moteur refuse de confirmer ou d’infirmer.',
                'We obtained one page of a contract. Moteur will neither confirm nor deny.'
            )
        ],
        entry: {
            state: 'rejected',
            daysAgo: 12,
            by: who('sophie'),
            review: {
                reviewer: who('louise'),
                note: 'Une seule source anonyme, c’est insuffisant. Trouve une deuxième source ou on retire la page du contrat.'
            }
        }
    }),
    article({
        id: 'hs-lexique',
        issue: HS,
        author: 'unit-7',
        category: 'technique',
        title: ['Lexique'],
        slug: ['lexique'],
        readingTime: 1,
        order: 4,
        body: [
            b.p(
                '**Porteuse**: onde qui transporte le signal.\n\n**Bruit**: tout ce que l’on n’a pas demandé.'
            )
        ],
        entry: { state: 'draft', daysAgo: 4, by: who('unit7') }
    })
];

export const webArticles: SourceEntry[] = [
    article({
        id: 'web-guide-redaction',
        author: 'theo',
        category: 'technique',
        title: [
            'Guide du rédacteur: écrire pour le Journal',
            'Writer’s guide: writing for the Journal'
        ],
        slug: ['guide-du-redacteur', 'writers-guide'],
        excerpt: [
            'Les règles de la maison, de la virgule au clou de girofle.',
            'House rules, from commas to cloves.'
        ],
        readingTime: 5,
        tags: ['rédaction', 'guide'],
        body: [
            b.h('Les cinq règles', 'The five rules'),
            b.p(
                '1. 900 mots maximum.\n2. Chaque article existe en français **et** en anglais, sauf avis contraire de Trois.\n3. On ne photographie pas un robot de face.\n4. Une source anonyme ne suffit jamais.\n5. Relecture obligatoire, même pour Louise.',
                '1. 900 words maximum.\n2. Every article exists in French **and** English, unless Trois says otherwise.\n3. Never photograph a robot head-on.\n4. One anonymous source is never enough.\n5. Mandatory review, even for Louise.'
            ),
            b.h('Gabarit de dépêche', 'Wire template', 'h3'),
            b.code(
                'DATELINE: VILLE · DATE\nTITRE: (moins de 60 signes)\nCHAPEAU: (une phrase)\nCORPS: …',
                'text',
                'gabarit.txt'
            ),
            b.embed(
                'https://journal.moteur.test/archives',
                'Archives du Journal',
                'Journal archive'
            ),
            b.button(
                'mailto:redaction@moteur-journal.test',
                'Proposer un article',
                'Pitch a story'
            ),
            b.ad(
                'Moteur Studio',
                'Moteur Studio',
                'Gérez votre contenu, en temps réel, à plusieurs.',
                'Manage your content, in real time, together.',
                ['Découvrir', 'Discover'],
                'https://moteur.dev',
                ['NOUVEAU', 'NEW']
            )
        ],
        entry: { daysAgo: 90 }
    }),
    article({
        id: 'web-bonne-annee',
        author: 'louise',
        category: 'communique',
        title: ['Bonne année 1979!', 'Happy New Year 1979!'],
        slug: ['bonne-annee-1979', 'happy-new-year-1979'],
        readingTime: 1,
        body: [
            b.kinetic('Bonne année!', 'Happy New Year!', 'letters'),
            b.p(
                'Toute l’équipe du Journal, humaine et non humaine, vous souhaite une excellente année.',
                'Everyone at the Journal, human and otherwise, wishes you a wonderful year.'
            )
        ],
        entry: { state: 'unpublished', daysAgo: 70 }
    }),
    article({
        id: 'web-titre-long',
        author: 'pierre-yves',
        category: 'opinion',
        title: [
            'Le plus long titre jamais publié par le Journal, parce que le comité de rédaction n’a pas réussi à s’entendre sur une version plus courte',
            'The longest headline the Journal has ever published, because the editorial board could not agree on anything shorter than this one'
        ],
        slug: ['le-plus-long-titre', 'the-longest-headline'],
        excerpt: [
            'Un article court. Le titre a pris toute la place.',
            'A short article. The headline took all the room.'
        ],
        readingTime: 1,
        tags: ['courrier', 'titres', 'rédaction', 'humour', 'comité', 'débat', 'longueur', 'mots'],
        body: [b.p('Voilà.', 'There.')],
        entry: { daysAgo: 45 }
    }),
    article({
        id: 'web-video-maison',
        author: 'theo',
        category: 'reportage',
        title: ['Vidéo: la chaîne MAISON en 1975', 'Video: the MAISON line in 1975'],
        slug: ['video-chaine-maison-1975', 'video-maison-line-1975'],
        excerpt: [
            'Douze minutes de film 16 mm, restaurées.',
            'Twelve minutes of 16 mm film, restored.'
        ],
        readingTime: 12,
        tags: ['vidéo', 'archives', 'MAISON'],
        cover: 'scene-factory-lachine',
        body: [
            b.video(
                'youtube',
                'moteur-maison-line-1975',
                'La chaîne MAISON, usine de Lachine, 1975',
                'The MAISON line, Lachine plant, 1975',
                'Film 16 mm, restauré en 1978.',
                '16 mm film, restored in 1978.'
            ),
            b.p(
                'Musique: Les Trois Accords du Plateau. Narration: Henri Beaumont.',
                'Music: Les Trois Accords du Plateau. Narration: Henri Beaumont.'
            )
        ],
        entry: { daysAgo: 38 }
    }),
    article({
        id: 'web-rectificatif',
        author: 'louise',
        category: 'communique',
        title: ['Rectificatif: le délai du COMPAGNON-9', 'Correction: the COMPAGNON-9 wait'],
        slug: ['rectificatif-compagnon-9', 'correction-compagnon-9'],
        excerpt: [
            'Le délai est de quatre ans et deux mois, pas de quatre ans.',
            'The wait is four years and two months, not four years.'
        ],
        readingTime: 1,
        body: [
            b.warning(
                'RECTIFICATIF',
                'Dans notre numéro 04, nous avons écrit « quatre ans ». Le délai réel est de quatre ans et deux mois. Nos excuses aux 8 243 personnes concernées.',
                'In issue 04, we wrote "four years". The actual wait is four years and two months. Our apologies to the 8,243 people concerned.'
            )
        ],
        entry: {
            state: 'scheduled-unpublish',
            scheduleInDays: 10,
            daysAgo: 20,
            edits: [
                { by: who('louise'), daysAgo: 18, data: { readingTime: 1 } },
                {
                    by: who('louise'),
                    daysAgo: 17,
                    data: {
                        excerpt: t(
                            'Le délai est de quatre ans et deux mois.',
                            'The wait is four years and two months.'
                        )
                    }
                }
            ]
        }
    }),
    article({
        id: 'web-infolettre',
        author: 'theo',
        category: 'communique',
        title: ['Recevez le Journal par la poste', 'Get the Journal by mail'],
        slug: ['infolettre', 'newsletter'],
        readingTime: 1,
        body: [
            b.hero(
                'Le Journal, chez vous.',
                'The Journal, at your door.',
                'cover-issue-05',
                'Un numéro par saison. Gratuit pour les propriétaires.',
                'One issue per season. Free for owners.'
            ),
            b.form(
                'infolettre',
                'Abonnez-vous',
                'Subscribe',
                'Merci! Premier numéro dans six à huit semaines.',
                'Thank you! First issue in six to eight weeks.'
            ),
            b.spacer('lg'),
            b.divider(),
            b.p(
                'Nous ne partageons jamais votre adresse. Pas même avec Trois.',
                'We never share your address. Not even with Trois.'
            )
        ],
        entry: { daysAgo: 60 }
    }),
    article({
        id: 'web-sans-auteur-visible',
        author: 'unit-7',
        category: 'histoire',
        title: ['Le garage aujourd’hui', 'The garage today'],
        slug: ['le-garage-aujourdhui', 'the-garage-today'],
        readingTime: 2,
        cover: 'scene-garage',
        body: [
            b.image(
                'scene-garage',
                'Le 4572, rue Saint-Denis, en 1978. C’est maintenant une boulangerie.',
                '4572 Rue Saint-Denis in 1978. It’s a bakery now.'
            ),
            b.p(
                'La boulangère n’a jamais entendu parler de nous. Elle fait une excellente tourtière.',
                'The baker has never heard of us. She makes an excellent tourtière.'
            )
        ],
        entry: { daysAgo: 33 }
    })
];

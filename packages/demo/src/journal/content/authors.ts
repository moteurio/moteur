import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';

type AuthorSrc = {
    id: string;
    name: string;
    kind: 'human' | 'robot';
    role: [string, string];
    bio: [string, string?];
    email?: string;
    joined?: string;
    languages?: string[];
    website?: string;
    social?: Array<{ network: string; handle: string }>;
    portrait?: boolean;
    daysAgo?: number;
    state?: SourceEntry['state'];
};

const author = (a: AuthorSrc): SourceEntry => ({
    id: a.id,
    daysAgo: a.daysAgo ?? 130,
    state: a.state,
    by: who('louise'),
    data: {
        name: a.name,
        slug: a.id,
        kind: a.kind,
        role: t(...a.role),
        bio: a.bio[1] === undefined ? { fr: a.bio[0] } : { fr: a.bio[0], en: a.bio[1] },
        ...(a.portrait !== false && { portrait: { art: `author-${a.id}` } }),
        ...(a.email && { email: a.email }),
        ...(a.joined && { joined: a.joined }),
        ...(a.languages && { languages: a.languages }),
        ...(a.website && { website: { url: a.website, label: 'Site' } }),
        ...(a.social && { social: a.social })
    }
});

export const authors: SourceEntry[] = [
    author({
        id: 'henri',
        name: 'Henri Beaumont',
        kind: 'human',
        role: ['Fondateur', 'Founder'],
        bio: [
            'Né à Québec en 1931, formé en génie électrique à McGill. Il quitte Hydro-Québec en 1967 pour construire, dans un garage de la rue Saint-Denis, une machine capable de porter un plateau sans renverser le café. Il y parvient au onzième essai.',
            'Born in Quebec City in 1931, trained in electrical engineering at McGill. He left Hydro-Québec in 1967 to build, in a garage on Rue Saint-Denis, a machine that could carry a tray without spilling the coffee. He managed it on the eleventh attempt.'
        ],
        email: 'h.beaumont@moteur-journal.test',
        joined: '1968-03-01',
        languages: ['fr', 'en'],
        social: [{ network: 'telex', handle: 'MOTEUR MTL 05-24871' }]
    }),
    author({
        id: 'diane',
        name: 'Diane Tremblay',
        kind: 'human',
        role: ['Directrice de recherche', 'Research Director'],
        bio: [
            'Mathématicienne, inventrice de la **mémoire contextuelle** (1970). Elle a refusé trois fois la direction générale de Moteur pour rester au laboratoire.\n\n> Tout ce qui apprend mérite le respect.',
            'Mathematician, inventor of **contextual memory** (1970). She turned down the top job at Moteur three times to stay in the lab.\n\n> Anything that learns deserves respect.'
        ],
        joined: '1969-09-15',
        languages: ['fr', 'en']
    }),
    author({
        id: 'yves',
        name: 'Yves Lalonde',
        kind: 'human',
        role: ['Ingénieur en chef', 'Chief Engineer'],
        bio: [
            'Co-fondateur, responsable de tout ce qui a des roues, des articulations ou des fusibles. Il tient un carnet de chaque panne depuis 1968; il en est au carnet 41.',
            'Co-founder, responsible for everything with wheels, joints or fuses. He has logged every breakdown since 1968 and is now on notebook 41.'
        ],
        joined: '1968-03-01',
        languages: ['fr']
    }),
    author({
        id: 'marguerite',
        name: 'Marguerite Fontaine',
        kind: 'human',
        role: ['Journaliste indépendante', 'Freelance journalist'],
        bio: [
            'Elle a vécu six mois avec un MAISON-3 pour le numéro 02, puis a refusé de le rendre. Collabore aussi à *Châtelaine* et à Radio-Canada.',
            'She lived with a MAISON-3 for six months for issue 02, then refused to give it back. Also writes for *Châtelaine* and CBC Radio.'
        ],
        email: 'marguerite@moteur-journal.test',
        joined: '1971-02-01',
        languages: ['fr', 'en'],
        website: 'https://marguerite-fontaine.moteur.test'
    }),
    author({
        id: 'celeste',
        name: 'Dr Céleste Armand',
        kind: 'human',
        role: ['Philosophe, rédactrice en chef adjointe', 'Philosopher, deputy editor'],
        bio: [
            'Professeure de philosophie à l’Université de Montréal. Elle relit chaque article avant publication et pose toujours la même question: « Et la machine, qu’en pense-t-elle? »',
            'Professor of philosophy at the Université de Montréal. She reads every article before publication and always asks the same question: "And what does the machine think?"'
        ],
        joined: '1970-06-01',
        languages: ['fr', 'en']
    }),
    author({
        id: 'sophie',
        name: 'Sophie Marchand',
        kind: 'human',
        role: ['Correspondante', 'Correspondent'],
        bio: [
            'Enquêtrice. A passé deux ans sur la liste d’attente du COMPAGNON-9 — en tant que journaliste, précise-t-elle.',
            'Investigative reporter. Spent two years on the COMPAGNON-9 waiting list — as a journalist, she insists.'
        ],
        joined: '1973-05-01',
        languages: ['fr', 'en', 'es']
    }),
    author({
        id: 'jf',
        name: 'Jean-François Côté',
        kind: 'human',
        role: ['Correspondant architecture', 'Architecture correspondent'],
        bio: [
            'Architecte de formation, il écrit sur les villes que les robots construisent et sur celles qu’ils ne devraient pas toucher. Traduit aussi le Journal vers l’anglais.',
            'An architect by training, he writes about the cities robots build and the ones they should leave alone. Also translates the Journal into English.'
        ],
        joined: '1974-01-10',
        languages: ['fr', 'en']
    }),
    author({
        id: 'unit-7',
        name: 'Unit 7-PASCAL',
        kind: 'robot',
        role: ['Division éditoriale', 'Editorial Division'],
        bio: [
            'Unité de rédaction de la série COMPAGNON, affectée au Journal en 1972. Capable de transcrire six heures d’entretien sans pause. Aime le café, bien qu’elle ne puisse pas en boire.',
            'A COMPAGNON-series writing unit, assigned to the Journal in 1972. Can transcribe six hours of interviews without a break. Likes coffee, although it cannot drink any.'
        ],
        joined: '1972-11-03',
        languages: ['fr', 'en', 'binary']
    }),
    author({
        id: 'horizon-003',
        name: 'HORIZON-E Unité 003',
        kind: 'robot',
        role: ['Expédition Atlantique Nord', 'North Atlantic Expedition'],
        bio: [
            'Unité d’exploration en eaux profondes. Ses rapports arrivent par radio, en majuscules, avec quatre-vingt-dix secondes de délai.',
            'Deep-water exploration unit. Its reports arrive by radio, in capitals, with a ninety-second delay.'
        ],
        joined: '1977-08-20',
        languages: ['fr', 'en', 'binary']
    }),
    // New voices
    author({
        id: 'louise',
        name: 'Louise Gagnon',
        kind: 'human',
        role: ['Rédactrice en chef', 'Editor-in-chief'],
        bio: [
            'Arrivée en 1975 du *Devoir*. Elle a introduit la relecture obligatoire, la double signature humaine-machine et la règle des 900 mots.',
            'Joined in 1975 from *Le Devoir*. She introduced mandatory review, joint human–machine bylines and the 900-word rule.'
        ],
        email: 'louise@moteur-journal.test',
        joined: '1975-01-06',
        languages: ['fr', 'en']
    }),
    author({
        id: 'theo',
        name: 'Théo Nguyen',
        kind: 'human',
        role: ['Photographe et maquettiste', 'Photographer and layout artist'],
        bio: [
            'Il signe les couvertures depuis le numéro 03. Refuse de photographier un robot de face « parce que c’est impoli ».',
            'Has designed every cover since issue 03. Refuses to photograph a robot head-on "because it’s rude".'
        ],
        joined: '1971-04-12',
        languages: ['fr', 'en'],
        website: 'https://theo-nguyen.moteur.test'
    }),
    author({
        id: 'maison-3-trois',
        name: 'MAISON-3 « Trois »',
        kind: 'robot',
        role: ['Chroniqueuse culinaire', 'Food columnist'],
        bio: [
            'L’unité de Marguerite Fontaine. A publié une seule chronique, sur la tourtière, qui a suscité 412 lettres de lecteurs.'
        ],
        joined: '1976-11-01',
        languages: ['fr']
    }),
    author({
        id: 'ana',
        name: 'Ana Ribeiro',
        kind: 'human',
        role: ['Correspondante à Lisbonne', 'Lisbon correspondent'],
        bio: [
            'Couvre l’arrivée des unités INDUSTRIE dans les chantiers navals portugais. Écrit en portugais; le Journal la traduit.',
            'Covers the arrival of INDUSTRIE units in Portuguese shipyards. Writes in Portuguese; the Journal translates her.'
        ],
        joined: '1977-03-01',
        languages: ['es', 'fr'],
        portrait: false,
        state: 'draft',
        daysAgo: 6
    }),
    author({
        id: 'pierre-yves',
        name: 'Pierre-Yves Lemieux-Desrochers de la Vérendrye',
        kind: 'human',
        role: ['Courrier des lecteurs', 'Letters editor'],
        bio: [
            'Le plus long nom de la rédaction, le plus court des courriers: il répond à chaque lettre en moins de cinquante mots.',
            'The longest name in the newsroom, the shortest replies: he answers every letter in under fifty words.'
        ],
        joined: '1976-09-01',
        languages: ['fr', 'en']
    })
];

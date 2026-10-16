import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';

const cat = (
    id: string,
    name: [string, string],
    description: [string, string],
    color: string,
    icon: string,
    order: number
): SourceEntry => ({
    id,
    daysAgo: 120,
    data: {
        name: t(...name),
        slug: t(id, id),
        description: t(...description),
        color,
        icon,
        order
    }
});

export const categories: SourceEntry[] = [
    cat(
        'histoire',
        ['Histoire', 'History'],
        ['Comment tout a commencé, et ce qui a suivi.', 'How it all began, and what came next.'],
        '#8a6a43',
        'lucide:history',
        0
    ),
    cat(
        'portrait',
        ['Portrait', 'Portrait'],
        [
            'Les personnes, humaines ou non, derrière Moteur.',
            'The people, human or otherwise, behind Moteur.'
        ],
        '#d8622b',
        'lucide:user',
        1
    ),
    cat(
        'technique',
        ['Technique', 'Technical'],
        [
            'Schémas, circuits et mémoire contextuelle.',
            'Schematics, circuits and contextual memory.'
        ],
        '#2f5d8a',
        'lucide:tool',
        2
    ),
    cat(
        'reportage',
        ['Reportage', 'Feature'],
        ['Sur le terrain, au foyer, à l’usine.', 'In the field, at home, on the factory floor.'],
        '#2f8a6e',
        'lucide:camera',
        3
    ),
    cat(
        'essai',
        ['Essai', 'Essay'],
        [
            'Ce que les machines nous apprennent sur nous-mêmes.',
            'What machines teach us about ourselves.'
        ],
        '#6d5a44',
        'lucide:feather',
        4
    ),
    cat(
        'communique',
        ['Communiqué', 'Statement'],
        [
            'Ce que la direction peut dire. Et ce qu’elle tait.',
            'What management can say. And what it can’t.'
        ],
        '#1c2229',
        'lucide:megaphone',
        5
    ),
    cat(
        'enquete',
        ['Enquête', 'Investigation'],
        ['Listes d’attente, contrats, zones grises.', 'Waiting lists, contracts, grey areas.'],
        '#c0392b',
        'lucide:search',
        6
    ),
    cat(
        'memoire',
        ['Mémoire', 'Memory'],
        ['Hommages, nécrologies, souvenirs.', 'Tributes, obituaries, recollections.'],
        '#62b6cb',
        'lucide:archive',
        7
    ),
    cat(
        'expedition',
        ['Expédition', 'Expedition'],
        [
            'Le fond de l’océan, le Grand Nord, et plus loin.',
            'The ocean floor, the far north, and further.'
        ],
        '#1b4965',
        'lucide:compass',
        8
    ),
    cat(
        'opinion',
        ['Opinion', 'Opinion'],
        ['Des avis tranchés, signés.', 'Strong views, signed.'],
        '#e07a5f',
        'lucide:message',
        9
    )
];

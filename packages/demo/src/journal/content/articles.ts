import type { SourceEntry } from '../../runtime/types.js';
import { t } from '../../runtime/fields.js';
import { who } from '../team.js';
import { archiveArticles } from './articles-archive.js';
import { issueArticles } from './articles-issues.js';
import { specialArticles, webArticles } from './articles-web.js';
import { ISSUES } from './issues.js';

/** What the original thirteen articles gain beyond their text: covers, tags, history. */
const ARCHIVE_EXTRAS: Record<
    string,
    { data?: Record<string, unknown>; entry?: Omit<SourceEntry, 'id' | 'data'> }
> = {
    'issue-01-1': {
        data: {
            cover: { art: 'scene-garage' },
            tags: ['fondateurs', 'garage', '1968'],
            featured: true,
            accent: '#d8622b',
            related: ['issue-01-3', 'issue-05-7']
        },
        entry: { by: who('louise') }
    },
    'issue-01-2': {
        data: {
            cover: { art: 'author-diane' },
            tags: ['portrait', 'mémoire contextuelle'],
            contributors: ['diane']
        },
        entry: { by: who('unit7') }
    },
    'issue-01-3': {
        data: { cover: { art: 'scene-blueprint-la-chose' }, tags: ['prototype', 'LA CHOSE'] },
        entry: { by: who('louise') }
    },
    'issue-02-1': {
        data: {
            cover: { art: 'robot-maison-3' },
            tags: ['MAISON-3', 'journal intime'],
            featured: true
        },
        entry: {
            by: who('marguerite'),
            state: 'edited',
            edits: [{ by: who('marguerite'), daysAgo: 5, data: { readingTime: 11 } }],
            comments: [
                {
                    by: who('celeste'),
                    field: 'body',
                    body: 'Le passage sur le chat est-il vérifié? Le chat a-t-il été consulté?',
                    replies: [{ by: who('marguerite'), body: 'Le chat a refusé de commenter.' }],
                    resolvedBy: who('celeste')
                }
            ]
        }
    },
    'issue-02-2': { data: { tags: ['confiance', 'éthique'] }, entry: { by: who('celeste') } },
    'issue-03-1': {
        data: {
            cover: { art: 'scene-factory' },
            tags: ['INDUSTRIE-F', 'usine', 'nuit'],
            featured: true,
            related: ['issue-03-3', 'issue-03-4']
        },
        entry: { by: who('unit7') }
    },
    'issue-03-2': { data: { tags: ['INDUSTRIE-X', 'confidentiel'] }, entry: { by: who('unit7') } },
    'issue-04-1': {
        data: {
            cover: { art: 'chart-waitlist' },
            tags: ['COMPAGNON-9', 'liste d’attente'],
            related: ['issue-04-3', 'web-rectificatif']
        },
        entry: { by: who('sophie') }
    },
    'issue-04-2': {
        data: { cover: { art: 'robot-compagnon-1' }, tags: ['COMPAGNON-1', 'hommage'] },
        entry: { by: who('louise') }
    },
    'issue-05-1': {
        data: {
            cover: { art: 'scene-ocean' },
            tags: ['HORIZON-E', 'océan'],
            featured: true,
            accent: '#1b4965'
        },
        entry: {
            by: who('louise'),
            state: 'edited',
            edits: [
                {
                    by: who('jf'),
                    daysAgo: 2,
                    data: {
                        excerpt: t(
                            'Rapport transmis depuis 3 847 mètres de profondeur, le 14 février 1978.',
                            'Report transmitted from 3,847 metres down, on 14 February 1978.'
                        )
                    }
                }
            ]
        }
    },
    'issue-05-2': {
        data: { tags: ['Paris', 'opinion'], related: ['issue-05-6'] },
        entry: { by: who('celeste') }
    },
    'issue-05-3': {
        data: { tags: ['HORIZON-∞', 'confidentiel'] },
        entry: { by: who('unit7'), state: 'unpublished' }
    },
    'issue-05-4': {
        data: { cover: { art: 'scene-skyline' }, tags: ['architecture', 'Vieux-Montréal'] },
        entry: { by: who('jf') }
    }
};

function issueDate(issueId: unknown): string | undefined {
    return ISSUES.find(i => i.id === issueId)?.publishedOn;
}

const archive: SourceEntry[] = archiveArticles.map((a, i) => {
    const extra = ARCHIVE_EXTRAS[a.id] ?? {};
    return {
        ...a,
        daysAgo: 118 - i * 1.5,
        ...extra.entry,
        data: { ...a.data, publishedOn: issueDate(a.data.issue), ...extra.data }
    };
});

const dated = (list: SourceEntry[], start: number): SourceEntry[] =>
    list.map((a, i) => ({
        ...a,
        daysAgo: a.daysAgo ?? start - i * 2,
        by: a.by ?? who('louise'),
        data:
            a.data.issue && !a.data.publishedOn
                ? { ...a.data, publishedOn: issueDate(a.data.issue) }
                : a.data
    }));

export const articles: SourceEntry[] = [
    ...archive,
    ...dated(issueArticles, 95),
    ...dated(specialArticles, 20),
    ...dated(webArticles, 60)
];

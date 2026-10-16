import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { Persona } from '../runtime/types.js';
import { asUser } from '../runtime/boot.js';
import { f, t } from '../runtime/fields.js';
import { dast } from '../runtime/dast.js';
import { createProjectFor, ensurePersonas, installSchemas, type Log } from '../runtime/project.js';

/**
 * A bulk project for performance work: `count` published articles in one model, a fifth of
 * them edited after publishing (so their public version lives in an older commit).
 *
 * Entries are written straight to disk in two commits rather than through the entry service:
 * the point is volume, not history.
 */
export const SCALE_ID = 'scale';

const bot: Persona = {
    id: 'scale-bot',
    name: 'Scale Bot',
    email: 'bot@scale.moteur.test',
    roles: ['admin']
};

const CATEGORIES = ['news', 'feature', 'review', 'interview', 'opinion'];

function entry(i: number, edited: boolean, commit?: string): Entry {
    const id = `a${String(i).padStart(6, '0')}`;
    const day = new Date(Date.UTC(2020, 0, 1) + i * 3_600_000).toISOString();
    const title = edited ? `Draft ${i}` : `Article ${i}`;
    return {
        id,
        type: 'article',
        status: 'published',
        data: {
            title: t(`${title} (fr)`, title),
            slug: t(`article-${i}`, `article-${i}`),
            category: CATEGORIES[i % CATEGORIES.length],
            rank: i % 1000,
            publishedOn: day.slice(0, 10),
            body: {
                dast: {
                    fr: dast(`Paragraphe ${i}. `.repeat(40)),
                    en: dast(`Paragraph ${i}. `.repeat(40))
                }
            }
        },
        meta: {
            audit: {
                createdAt: day,
                updatedAt: day,
                createdBy: bot.id,
                updatedBy: bot.id,
                revision: edited ? 2 : 1,
                publishedRevision: 1,
                publishedAt: day,
                ...(commit && { publishedCommit: commit })
            }
        }
    };
}

export async function buildScale(opts: { count: number; log: Log }): Promise<void> {
    const { count, log } = opts;
    if (!Number.isInteger(count) || count < 1) throw new Error('--scale needs a positive number');
    await ensurePersonas([bot]);
    await createProjectFor(
        {
            id: SCALE_ID,
            label: `Scale — ${count.toLocaleString('en')} entries`,
            description: 'Bulk content for performance testing.',
            defaultLocale: 'fr',
            supportedLocales: ['fr', 'en'],
            users: [],
            git: { enabled: true }
        } as ProjectSchema,
        bot,
        [bot]
    );
    await installSchemas(SCALE_ID, bot, {
        models: [
            {
                id: 'article',
                label: 'Article',
                modelType: 'content',
                fields: {
                    title: f.text('Title', { multilingual: true, required: true }),
                    slug: f.slug('Slug', 'title', { multilingual: true }),
                    category: f.select('Category', CATEGORIES),
                    rank: f.number('Rank'),
                    publishedOn: f.date('Published on'),
                    body: f.richText('Body', { multilingual: true })
                }
            }
        ]
    });

    const fs = await import('fs');
    const path = await import('path');
    const { projectDir } = await import('@moteurio/core/utils/pathUtils.js');
    const { addAllAndCommit } = await import('@moteurio/core/git/index.js');
    const dir = projectDir(SCALE_ID);
    const write = (e: Entry) => {
        const d = path.join(dir, 'models', 'article', 'entries', e.id);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'entry.json'), JSON.stringify(e, null, 2));
    };

    for (let i = 0; i < count; i++) write(entry(i, false));
    const commit = addAllAndCommit(dir, `Add ${count} articles`, asUser(bot));
    log(`${count} articles written`);
    let edited = 0;
    for (let i = 0; i < count; i += 5) {
        write(entry(i, true, commit));
        edited++;
    }
    addAllAndCommit(dir, `Edit ${edited} articles after publishing`, asUser(bot));
    log(`${edited} edited after publishing`);
}

import type { ModelSchema } from '@moteurio/types/Model.js';
import type { Persona } from '../runtime/types.js';
import { asUser } from '../runtime/boot.js';
import { setDaysAgo } from '../runtime/clock.js';
import { settle } from '../runtime/workflow.js';
import { team } from './team.js';

const EVOLVING = new Set(['article', 'author', 'faq']);

function byId(models: ModelSchema[], id: string): ModelSchema {
    const m = models.find(x => x.id === id);
    if (!m) throw new Error(`Model "${id}" not in journal schema`);
    return m;
}

function pickFields(final: ModelSchema, keys: string[]): ModelSchema['fields'] {
    const fields: ModelSchema['fields'] = {};
    for (const key of keys) {
        const field = final.fields[key];
        if (field) fields[key] = field;
    }
    return fields;
}

/** Models as they existed when the Journal first opened its CMS (before later field additions). */
export function journalModelsAtLaunch(finalModels: ModelSchema[]): ModelSchema[] {
    const article = byId(finalModels, 'article');
    const author = byId(finalModels, 'author');
    const faq = byId(finalModels, 'faq');

    const launch: Record<string, ModelSchema> = {
        article: {
            ...article,
            description:
                'Magazine articles: title, author, category and a block body. More metadata came later.',
            fields: pickFields(article, ['title', 'slug', 'excerpt', 'author', 'category', 'body']),
            studio: undefined
        },
        author: {
            ...author,
            description:
                'Writers and staff profiles — biography first, contact details added later.',
            fields: pickFields(author, ['name', 'slug', 'role', 'bio', 'portrait'])
        },
        faq: {
            ...faq,
            description:
                'Question and answer pairs; topics and ordering were added for the website.',
            fields: pickFields(faq, ['question', 'answer'])
        }
    };

    return finalModels.map(m => (EVOLVING.has(m.id) ? launch[m.id]! : m));
}

type Step = {
    daysAgo: number;
    modelId: string;
    message: string;
    persona: Persona;
    patch: (final: ModelSchema, current: ModelSchema) => Partial<ModelSchema>;
};

function steps(finalModels: ModelSchema[]): Step[] {
    const article = byId(finalModels, 'article');
    const author = byId(finalModels, 'author');
    const faq = byId(finalModels, 'faq');

    return [
        {
            daysAgo: 139,
            modelId: 'article',
            persona: team.louise,
            message: 'Article model: print metadata',
            patch: (_final, current) => ({
                description: article.description,
                fields: {
                    ...current.fields,
                    ...pickFields(article, ['cover', 'issue', 'tags', 'publishedOn'])
                }
            })
        },
        {
            daysAgo: 138,
            modelId: 'author',
            persona: team.louise,
            message: 'Author model: humans, robots and contact',
            patch: (_final, current) => ({
                fields: {
                    ...current.fields,
                    ...pickFields(author, ['kind', 'email', 'joined'])
                }
            })
        },
        {
            daysAgo: 137,
            modelId: 'article',
            persona: team.marguerite,
            message: 'Article model: contributors and reading cues',
            patch: (_final, current) => ({
                fields: {
                    ...current.fields,
                    ...pickFields(article, ['contributors', 'readingTime', 'featured', 'accent'])
                }
            })
        },
        {
            daysAgo: 136,
            modelId: 'faq',
            persona: team.sophie,
            message: 'FAQ model: topics and manual order',
            patch: (_final, current) => ({
                description: faq.description,
                fields: {
                    ...current.fields,
                    ...pickFields(faq, ['topics', 'order'])
                }
            })
        },
        {
            daysAgo: 135,
            modelId: 'author',
            persona: team.jf,
            message: 'Author model: languages and social links',
            patch: (_final, current) => ({
                fields: {
                    ...current.fields,
                    ...pickFields(author, ['languages', 'website', 'social'])
                }
            })
        },
        {
            daysAgo: 134,
            modelId: 'article',
            persona: team.theo,
            message: 'Article model: web fields and Studio form',
            patch: () => ({
                fields: article.fields,
                studio: article.studio
            })
        }
    ];
}

/** Play schema changes on the simulated clock so model.json has real git history. */
export async function evolveJournalSchemas(
    projectId: string,
    finalModels: ModelSchema[],
    log: (line: string) => void
): Promise<void> {
    const { updateModelSchema, getModelSchemaForProject } =
        await import('@moteurio/core/models.js');
    for (const step of steps(finalModels)) {
        setDaysAgo(step.daysAgo);
        const final = byId(finalModels, step.modelId);
        const current = await getModelSchemaForProject(projectId, step.modelId);
        if (!current) throw new Error(`Model "${step.modelId}" missing before evolution`);
        const patch = step.patch(final, current);
        await updateModelSchema(asUser(step.persona), projectId, step.modelId, patch);
        await settle();
        log(`schema: ${step.message} (${step.modelId})`);
    }
}

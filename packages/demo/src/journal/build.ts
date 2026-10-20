import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { SourceEntry } from '../runtime/types.js';
import { prepareFields, type UploadedArt } from '../runtime/prepare.js';
import { Timeline } from '../runtime/workflow.js';
import { setDaysAgo, present } from '../runtime/clock.js';
import { asUser } from '../runtime/boot.js';
import { uploadArt } from '../runtime/assets.js';
import {
    createProjectFor,
    ensurePersonas,
    installSchemas,
    validateEntries,
    type Log,
    type ValidationReport
} from '../runtime/project.js';
import { models, blocks, templates } from './schema.js';
import { evolveJournalSchemas, journalModelsAtLaunch } from './schemaEvolution.js';
import { personas, lead, reviewer, team } from './team.js';
import { art } from './art.js';
import { content } from './content/index.js';
import { buildSite } from './site.js';

import { JOURNAL_ID } from './ids.js';

export { JOURNAL_ID };

export const project: ProjectSchema = {
    id: JOURNAL_ID,
    label: 'Moteur Journal',
    description:
        'The bilingual magazine of Moteur Industries S.A., Montréal, 1968–1978: issues, articles, authors, robots, events and more.',
    defaultLocale: 'fr',
    supportedLocales: ['fr', 'en'],
    users: [],
    isActive: true,
    siteUrl: 'https://journal.moteur.test',
    workflow: { enabled: true, mode: 'auto_publish', requireReview: true },
    git: { enabled: true },
    ai: { enabled: true }
} as ProjectSchema;

export type JournalOptions = { password?: string; log: Log };

export async function buildJournal(opts: JournalOptions): Promise<ValidationReport> {
    const { log } = opts;
    setDaysAgo(150);
    await ensurePersonas(personas, opts.password);
    await createProjectFor(project, lead, personas);
    await installSchemas(JOURNAL_ID, lead, {
        blocks,
        models: journalModelsAtLaunch(models),
        templates
    });
    log(`schemas: ${models.length} models, ${blocks.length} blocks, ${templates.length} templates`);
    await evolveJournalSchemas(JOURNAL_ID, models, log);

    setDaysAgo(140);
    const uploaded = await uploadArt(JOURNAL_ID, asUser(lead), art());
    log(`media: ${uploaded.size} files`);

    const { listBlocks } = await import('@moteurio/core/blocks.js');
    const registry = listBlocks(JOURNAL_ID) as Record<string, BlockSchema>;
    const lookup = (key: string): UploadedArt => {
        const a = uploaded.get(key);
        if (!a) throw new Error(`Unknown art "${key}"`);
        return a;
    };
    const fieldsOf = new Map(models.map(m => [m.id, m.fields]));
    const timeline = new Timeline({
        projectId: JOURNAL_ID,
        personas,
        lead: lead.id,
        reviewer: reviewer.id,
        prepare: (modelId, data) =>
            prepareFields(fieldsOf.get(modelId), data, { blocks: registry, art: lookup })
    });
    const entries: Array<[string, SourceEntry[]]> = content();
    for (const [modelId, list] of entries) for (const e of list) timeline.entry(modelId, e);
    await buildSite(timeline, { lookup, blocks: registry });
    let steps = 0;
    await timeline.run(() => {
        if (++steps % 50 === 0) log(`  ${steps} actions`);
    });
    present();
    log(`content: ${entries.reduce((n, [, l]) => n + l.length, 0)} entries, ${steps} actions`);

    // createProjectBlock writes block definitions without committing them.
    const { projectDir } = await import('@moteurio/core/utils/pathUtils.js');
    const { addAndCommit } = await import('@moteurio/core/git/index.js');
    addAndCommit(
        projectDir(JOURNAL_ID),
        ['blocks'],
        `Add Journal blocks — ${team.theo.name}`,
        asUser(team.theo)
    );
    return validateEntries(JOURNAL_ID);
}

import type { User } from '@moteurio/types/User.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { Persona, SourceEntry } from './types.js';
import { setDaysAgo, tick, present, isoInDays } from './clock.js';
import { asUser } from './boot.js';

/**
 * Plays every entry's history on one timeline, oldest action first, through core's own services.
 * The result has real revisions, publish commits, reviews, comments, notifications and activity,
 * exactly as if people had made the changes through the API.
 */

type Step = { at: number; seq: number; label: string; run: () => Promise<void> };

export type WorkflowOptions = {
    projectId: string;
    personas: Persona[];
    /** The persona who publishes directly, which is an admin. */
    lead: string;
    /** The default reviewer persona. */
    reviewer: string;
    /** Converts source data to stored data for a model. */
    prepare: (modelId: string, data: Record<string, unknown>) => Record<string, unknown>;
};

/** Waits for core's background work, such as the git commit hook and the activity log, to finish before time moves on. */
export async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 2));
}

export class Timeline {
    private steps: Step[] = [];
    private seq = 0;
    private readonly users = new Map<string, User>();
    private schedules: Array<() => Promise<void>> = [];

    constructor(private readonly opts: WorkflowOptions) {
        for (const p of opts.personas) this.users.set(p.id, asUser(p));
    }

    user(id: string | undefined): User {
        const u = this.users.get(id ?? this.opts.lead);
        if (!u) throw new Error(`Unknown persona "${id}"`);
        return u;
    }

    /** Queues an arbitrary action at a point in time. */
    at(daysAgo: number, label: string, run: () => Promise<void>): void {
        this.steps.push({ at: daysAgo, seq: this.seq++, label, run });
    }

    /** Queues an action for the end, in real time, because schedules must be in the future. */
    atPresent(run: () => Promise<void>): void {
        this.schedules.push(run);
    }

    /** Queues the whole history of one entry. */
    entry(modelId: string, src: SourceEntry): void {
        const { projectId } = this.opts;
        const state = src.state ?? 'published';
        const created = src.daysAgo ?? 30;
        const author = src.by;
        const resourceId = `${modelId}__${src.id}`;
        const core = this.core;

        this.at(created, `create ${resourceId}`, async () => {
            const { createEntry } = await core();
            await createEntry(
                this.user(author),
                projectId,
                modelId,
                { id: src.id, type: modelId, data: this.opts.prepare(modelId, src.data) } as Entry,
                { source: 'studio' }
            );
        });

        const wasPublished = [
            'published',
            'edited',
            'in-review',
            'rejected',
            'approved',
            'unpublished',
            'scheduled-unpublish'
        ].includes(state);
        // Entries in review, rejected or approved may be brand new, so publish them first only if they are edited later.
        const publishFirst =
            wasPublished && !(['in-review', 'rejected', 'approved'].includes(state) && !src.edits);
        if (publishFirst) {
            this.at(created - 0.2, `publish ${resourceId}`, async () => {
                const { publishEntry } = await core();
                await publishEntry(this.user(this.opts.lead), projectId, modelId, src.id, {
                    source: 'studio'
                });
            });
        }

        let last = created - 0.2;
        for (const [i, edit] of (src.edits ?? []).entries()) {
            const when = edit.daysAgo ?? Math.max(0.5, created - 2 - i * 1.5);
            last = Math.min(last, when);
            this.at(when, `edit ${resourceId}`, async () => {
                const { updateEntry } = await core();
                await updateEntry(
                    this.user(edit.by ?? author),
                    projectId,
                    modelId,
                    src.id,
                    { data: this.opts.prepare(modelId, edit.data) },
                    { source: 'studio' }
                );
            });
        }

        // With requireReview, a publish can only be scheduled for an entry that has an approved
        // review, and approving publishes the entry at once. A scheduled entry is therefore
        // approved, then taken down, and then scheduled to be published again.
        if (['in-review', 'rejected', 'approved', 'scheduled'].includes(state)) {
            const submitted = Math.max(0.3, last - 0.5);
            const reviewer = src.review?.reviewer ?? this.opts.reviewer;
            this.at(submitted, `submit ${resourceId}`, async () => {
                const { submitForReview, getReviews, approveReview, rejectReview } = await core();
                await submitForReview(projectId, this.user(author), modelId, src.id, reviewer);
                if (state === 'in-review') return;
                tick(90);
                const [review] = await getReviews(projectId, {
                    modelId,
                    entryId: src.id,
                    status: 'pending'
                });
                if (state === 'approved' || state === 'scheduled') {
                    await approveReview(projectId, this.user(reviewer), review.id);
                } else {
                    await rejectReview(
                        projectId,
                        this.user(reviewer),
                        review.id,
                        src.review?.note ?? 'Please revise before publishing.'
                    );
                }
            });
        }

        if (state === 'unpublished' || state === 'scheduled') {
            this.at(Math.max(0.4, last - 1), `unpublish ${resourceId}`, async () => {
                const { updateEntry } = await core();
                await updateEntry(
                    this.user(this.opts.lead),
                    projectId,
                    modelId,
                    src.id,
                    { status: 'unpublished' },
                    { source: 'studio' }
                );
            });
        }

        for (const c of src.comments ?? []) {
            const when = c.daysAgo ?? Math.max(0.2, last - 0.3);
            this.at(when, `comment ${resourceId}`, async () => {
                const { addComment, resolveComment } = await core();
                const root = await addComment(projectId, this.user(c.by), {
                    resourceType: 'entry',
                    resourceId,
                    ...(c.field && { fieldPath: c.field }),
                    body: c.body
                });
                for (const r of c.replies ?? []) {
                    tick(25);
                    await addComment(projectId, this.user(r.by), {
                        resourceType: 'entry',
                        resourceId,
                        ...(c.field && { fieldPath: c.field }),
                        parentId: root.id,
                        body: r.body
                    });
                }
                if (c.resolvedBy) {
                    tick(40);
                    await resolveComment(projectId, this.user(c.resolvedBy), root.id);
                }
            });
        }

        if (state === 'scheduled' || state === 'scheduled-unpublish') {
            const inDays = src.scheduleInDays ?? 7;
            this.atPresent(async () => {
                const { createSchedule } = await core();
                await createSchedule(this.user(this.opts.lead), projectId, {
                    resourceType: 'entry',
                    resourceId: src.id,
                    modelId,
                    action: state === 'scheduled' ? 'publish' : 'unpublish',
                    scheduledAt: isoInDays(inDays, 13)
                });
            });
        }
    }

    /** Runs every queued step in time order, then the steps that run at the present time. */
    async run(log: (line: string) => void = () => {}): Promise<void> {
        const steps = [...this.steps].sort((a, b) => b.at - a.at || a.seq - b.seq);
        for (const step of steps) {
            setDaysAgo(step.at);
            try {
                await step.run();
            } catch (err) {
                throw new Error(`${step.label}: ${(err as Error).message}`, { cause: err });
            }
            await settle();
            log(step.label);
        }
        present();
        for (const run of this.schedules) {
            await run();
            await settle();
        }
        this.steps = [];
        this.schedules = [];
    }

    private core = async () => {
        const [entries, reviews, comments, schedules] = await Promise.all([
            import('@moteurio/core/entries.js'),
            import('@moteurio/core/reviews.js'),
            import('@moteurio/core/comments.js'),
            import('@moteurio/core/schedules.js')
        ]);
        return { ...entries, ...reviews, ...comments, ...schedules };
    };
}

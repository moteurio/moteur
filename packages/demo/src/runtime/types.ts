/** A person who works on a demo project. Each persona becomes a user and a git author. */
export type Persona = {
    id: string;
    name: string;
    email: string;
    /** Platform roles. 'admin' and 'lead' publish without review, 'reviewer' approves, and no role means editor. */
    roles: string[];
};

/**
 * The state an entry is in after the build:
 * - draft: created, never published
 * - published: live, no pending changes
 * - edited: live, with edits made after publishing (the public API serves the older version)
 * - in-review: edited and submitted for review, awaiting a reviewer
 * - rejected: submitted, sent back with a comment
 * - approved: submitted and approved (published by the reviewer)
 * - unpublished: was live, taken down
 * - scheduled: approved, taken down, and scheduled to be published again (on review-required
 *   projects core only schedules publishing for entries that already have an approved review)
 * - scheduled-unpublish: live, with a pending unpublish schedule
 */
export type EntryState =
    | 'draft'
    | 'published'
    | 'edited'
    | 'in-review'
    | 'rejected'
    | 'approved'
    | 'unpublished'
    | 'scheduled'
    | 'scheduled-unpublish';

export type SourceComment = {
    by: string;
    body: string;
    /** The field the comment is attached to, as a dot path such as "title" or "body". */
    field?: string;
    daysAgo?: number;
    replies?: Array<{ by: string; body: string }>;
    /** The persona who resolved the comment. */
    resolvedBy?: string;
};

/** One entry as written in the demo sources. */
export type SourceEntry = {
    id: string;
    data: Record<string, unknown>;
    state?: EntryState;
    /** The persona who creates and edits the entry. Defaults to the project's lead editor. */
    by?: string;
    /** When the entry was created, in days before the build. */
    daysAgo?: number;
    /** The changes made after publishing, for the edited, in-review, rejected and approved states. */
    edits?: Array<{ by?: string; daysAgo?: number; data: Record<string, unknown> }>;
    /** Who reviews the entry, for the in-review, rejected and approved states, and the reason when it is rejected. */
    review?: { reviewer?: string; note?: string };
    comments?: SourceComment[];
    /** For the scheduled states, the number of days from now. */
    scheduleInDays?: number;
};

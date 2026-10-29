/** Someone who works on a demo project. Becomes a user (and a git author). */
export type Persona = {
    id: string;
    name: string;
    email: string;
    /** Platform roles: 'admin' and 'lead' publish without review, 'reviewer' approves, none = editor. */
    roles: string[];
};

/**
 * Where an entry ends up after the build:
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
    /** Field the comment is attached to (dot path), e.g. "title" or "body". */
    field?: string;
    daysAgo?: number;
    replies?: Array<{ by: string; body: string }>;
    /** Resolved by this persona. */
    resolvedBy?: string;
};

/** One entry as written in the demo sources. */
export type SourceEntry = {
    id: string;
    data: Record<string, unknown>;
    state?: EntryState;
    /** Persona who creates (and edits) the entry. Defaults to the project's lead editor. */
    by?: string;
    /** When it was created, in days before the build. */
    daysAgo?: number;
    /** Changes made after publishing (for edited / in-review / rejected / approved). */
    edits?: Array<{ by?: string; daysAgo?: number; data: Record<string, unknown> }>;
    /** Who reviews (in-review / rejected / approved) and, for rejected, why. */
    review?: { reviewer?: string; note?: string };
    comments?: SourceComment[];
    /** For scheduled states: days from now. */
    scheduleInDays?: number;
};

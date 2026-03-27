export type ActivityResourceType =
    | 'entry'
    | 'layout'
    | 'page'
    | 'template'
    | 'structure'
    | 'model'
    | 'project'
    | 'user'
    | 'blueprint'
    | 'schedule'
    | 'form'
    /** Content repository Git operations (commits, push failures). */
    | 'git';

export type ActivityAction =
    | 'created'
    | 'updated'
    | 'deleted'
    | 'published'
    | 'unpublished'
    | 'commented'
    | 'resolved'
    | 'submitted_for_review'
    | 'approved'
    | 'rejected'
    | 'schedule_failed'
    /** A new commit was created for the content repo (see `after.commit`). */
    | 'git_committed'
    /** Commit failed after save (see `after.error`, `after.paths`). */
    | 'git_commit_failed'
    /** Push to remote failed or was skipped (see `after`). */
    | 'git_push_failed';

export interface ActivityEvent {
    id: string;
    projectId: string;
    resourceType: ActivityResourceType;
    resourceId: string;
    action: ActivityAction;
    userId: string;
    userName: string;
    fieldPath?: string;
    before?: unknown;
    after?: unknown;
    timestamp: string; // ISO
}

/** Paginated activity log: events newest first, plus optional cursor for next page. */
export interface ActivityLogPage {
    events: ActivityEvent[];
    /** ISO timestamp of the oldest event in this page; use as `before` query param for the next page. */
    nextBefore?: string;
}

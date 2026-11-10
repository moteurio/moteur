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
    /** Git operations on the content repository, such as commits and push failures. */
    | 'git';

export type ActivityAction =
    | 'created'
    | 'updated'
    | 'deleted'
    /** Restored from the bin. The item returns as a draft. */
    | 'restored'
    | 'published'
    | 'unpublished'
    | 'commented'
    | 'resolved'
    | 'submitted_for_review'
    | 'approved'
    | 'rejected'
    | 'schedule_failed'
    /** A commit was created in the content repository (see `after.commit`). */
    | 'git_committed'
    /** Creating the commit failed after a save (see `after.error` and `after.paths`). */
    | 'git_commit_failed'
    /** Pushing to the remote failed or was skipped (see `after`). */
    | 'git_push_failed';

export interface ActivityEvent {
    id: string;
    projectId: string;
    resourceType: ActivityResourceType;
    resourceId: string;
    action: ActivityAction;
    userId: string;
    userName: string;
    /** The agent that acted on behalf of the user. When set, `userName` reads "<name> via <agent>". */
    agent?: string;
    fieldPath?: string;
    before?: unknown;
    after?: unknown;
    timestamp: string; // ISO 8601
}

/** One page of the activity log: events ordered newest first, plus an optional cursor for the next page. */
export interface ActivityLogPage {
    events: ActivityEvent[];
    /** ISO 8601 timestamp of the oldest event in this page. Pass it as the `before` query parameter to fetch the next page. */
    nextBefore?: string;
}

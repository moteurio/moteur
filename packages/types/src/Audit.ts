export interface Audit {
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    revision?: number;
    /** Revision number at the time of the last publish. Undefined when the item has never been published. */
    publishedRevision?: number;
    /** Git commit hash of the published version. The public API uses it to serve the published content. */
    publishedCommit?: string;
    /** ISO 8601 timestamp of when the item was last published. */
    publishedAt?: string;
}

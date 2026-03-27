export interface Audit {
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    revision?: number;
    /** Revision number at the time of last publish. undefined = never published. */
    publishedRevision?: number;
    /** Git commit hash of the published version. Used by the public API to serve frozen content. */
    publishedCommit?: string;
    /** ISO date string when the entry was last published. */
    publishedAt?: string;
}

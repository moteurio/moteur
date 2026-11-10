export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type ReviewResourceType = 'entry' | 'page';

export interface Review {
    id: string;
    projectId: string;
    /** @deprecated Use `resourceType` with `templateId` or `pageId` for pages. */
    modelId?: string;
    /** @deprecated Use `resourceType` with `templateId` or `pageId` for pages. */
    entryId?: string;
    resourceType?: ReviewResourceType;
    templateId?: string;
    pageId?: string;
    status: ReviewStatus;
    requestedBy: string;
    requestedByName: string;
    assignedTo?: string;
    reviewedBy?: string;
    reviewedByName?: string;
    rejectionCommentId?: string;
    createdAt: string;
    resolvedAt?: string;
    /** Fingerprint of the content that was submitted for review. The approval is valid only while the content still matches it. */
    submittedVersion?: string;
    /** ISO 8601 timestamp of when a publish consumed this approval. An approval can be used for one publish only. */
    usedAt?: string;
}

export interface GetReviewsOptions {
    modelId?: string;
    entryId?: string;
    templateId?: string;
    pageId?: string;
    resourceType?: ReviewResourceType;
    status?: ReviewStatus;
}

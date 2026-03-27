export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type ReviewResourceType = 'entry' | 'page';

export interface Review {
    id: string;
    projectId: string;
    /** @deprecated use resourceType + templateId/pageId for pages */
    modelId?: string;
    /** @deprecated use resourceType + templateId/pageId for pages */
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
}

export interface GetReviewsOptions {
    modelId?: string;
    entryId?: string;
    templateId?: string;
    pageId?: string;
    resourceType?: ReviewResourceType;
    status?: ReviewStatus;
}

export type NotificationType = 'review_requested' | 'approved' | 'rejected' | 'schedule_failed';

export interface Notification {
    id: string;
    projectId: string;
    userId: string;
    type: NotificationType;
    reviewId?: string;
    entryId?: string;
    modelId?: string;
    pageId?: string;
    templateId?: string;
    scheduleId?: string;
    error?: string;
    resourceType?: 'entry' | 'page';
    resourceId?: string;
    action?: 'publish' | 'unpublish';
    read: boolean;
    createdAt: string;
}

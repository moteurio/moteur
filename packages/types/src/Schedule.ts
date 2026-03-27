export type ScheduleResourceType = 'entry' | 'page';
export type ScheduleAction = 'publish' | 'unpublish';
export type ScheduleStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

export interface Schedule {
    id: string;
    projectId: string;
    resourceType: ScheduleResourceType;
    resourceId: string;
    modelId?: string;
    action: ScheduleAction;
    scheduledAt: string;
    scheduledBy: string;
    status: ScheduleStatus;
    processedAt?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateScheduleInput {
    resourceType: ScheduleResourceType;
    resourceId: string;
    modelId?: string;
    action: ScheduleAction;
    scheduledAt: string;
}

export interface ListSchedulesOptions {
    resourceType?: ScheduleResourceType;
    resourceId?: string;
    status?: ScheduleStatus | ScheduleStatus[];
    action?: ScheduleAction;
}

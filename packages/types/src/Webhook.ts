// All event types Moteur can fire
export type WebhookEvent =
    | 'entry.created'
    | 'entry.updated'
    | 'entry.published'
    | 'entry.unpublished'
    | 'entry.deleted'
    | 'entry.scheduled'
    | 'entry.unscheduled'
    | 'entry.schedule.failed'
    | 'asset.created'
    | 'asset.updated'
    | 'asset.deleted'
    | 'page.published'
    | 'page.unpublished'
    | 'page.deleted'
    | 'page.scheduled'
    | 'page.unscheduled'
    | 'page.schedule.failed'
    | 'review.submitted'
    | 'review.approved'
    | 'review.rejected'
    | 'comment.created'
    | 'form.submitted'
    | 'radar.violation.created'
    | 'radar.violation.resolved';

// A filter narrows which events actually trigger delivery
// e.g. only fire when modelId === 'article'
export type WebhookFilterOperator = 'eq' | 'ne' | 'in' | 'nin';

export type WebhookFilter = {
    field: 'modelId' | 'status' | 'locale' | 'environment' | 'source';
    operator: WebhookFilterOperator;
    value: string | string[];
};

// The registered webhook endpoint
export type Webhook = {
    id: string;
    projectId: string;
    name: string; // "Vercel deploy", "Slack notify"
    url: string; // target HTTPS endpoint
    secret: string; // used to sign payloads — stored encrypted
    events: WebhookEvent[]; // which events to listen for; [] = all
    filters: WebhookFilter[]; // additional filters; [] = no filtering
    headers: Record<string, string>; // custom headers to include in every request
    enabled: boolean; // soft disable without deleting
    createdAt: string;
    updatedAt: string;
    createdBy: string;
};

// One delivery attempt record
export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

export type WebhookDelivery = {
    id: string;
    webhookId: string;
    projectId: string;

    // What was sent
    event: WebhookEvent;
    payload: WebhookPayload; // the full payload that was (or will be) sent

    // Outcome of the most recent attempt
    status: WebhookDeliveryStatus;
    responseStatus?: number; // HTTP status from the consumer
    responseBody?: string; // first 1000 chars of response body
    durationMs?: number;

    // Retry state
    attemptCount: number; // starts at 1
    nextRetryAt?: string; // ISO 8601 — null when no further retries planned
    lastAttemptAt?: string;

    createdAt: string; // when the delivery was first enqueued
};

// The payload envelope sent to the consumer
export type WebhookPayload = {
    id: string; // unique delivery ID — same as WebhookDelivery.id
    event: WebhookEvent;
    timestamp: string; // ISO 8601 UTC
    projectId: string;
    environment?: string; // which environment triggered the event
    source: 'studio' | 'api' | 'scheduler';
    data: WebhookPayloadData;
    test?: boolean; // true for test ping payloads
};

// Per-event data shapes
export type WebhookPayloadData =
    | EntryPayloadData
    | AssetPayloadData
    | PagePayloadData
    | ReviewPayloadData
    | CommentPayloadData
    | FormPayloadData
    | SchedulePayloadData
    | RadarPayloadData;

export type RadarPayloadData = {
    violation: import('./Radar.js').RadarViolation;
};

// Re-export for consumers that need both
export type { RadarViolation } from './Radar.js';

export type SchedulePayloadData = {
    scheduleId: string;
    entryId?: string;
    pageId?: string;
    modelId?: string;
    action: 'publish' | 'unpublish';
    scheduledAt?: string;
    error?: string;
};

export type EntryPayloadData = {
    entryId: string;
    modelId: string;
    status: string;
    locale?: string;
    slug?: string;
    updatedBy: string;
};

export type AssetPayloadData = {
    assetId: string;
    filename: string;
    mimeType: string;
    updatedBy: string;
};

export type PagePayloadData = {
    pageId: string;
    title: string;
    url: string;
    updatedBy: string;
};

export type ReviewPayloadData = {
    reviewId: string;
    entryId: string;
    modelId: string;
    status: string;
    reviewedBy?: string;
};

export type CommentPayloadData = {
    commentId: string;
    entryId: string;
    modelId: string;
    authorId: string;
};

export type FormPayloadData = {
    formId: string;
    formHandle: string;
    submissionId: string;
    fields: Record<string, unknown>;
};

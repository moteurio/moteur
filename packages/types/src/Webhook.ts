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
    | 'page.updated'
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
    | 'navigation.updated'
    | 'redirects.updated'
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

/** What live on the site changed: what a deploy hook listens to unless told otherwise. */
export const DEPLOY_EVENTS: WebhookEvent[] = [
    'entry.published',
    'entry.unpublished',
    'entry.deleted',
    'page.published',
    'page.updated',
    'page.unpublished',
    'page.deleted',
    'asset.updated',
    'asset.deleted',
    'navigation.updated',
    'redirects.updated'
];

// The registered webhook endpoint
export type Webhook = {
    id: string;
    projectId: string;
    name: string; // "Vercel deploy", "Slack notify"
    /**
     * `deploy`: a host's build hook (Vercel, Netlify, Cloudflare Pages…). Changes within
     * `batchSeconds` of the first one start a single build. Default: `webhook`, one call per event.
     */
    kind?: 'webhook' | 'deploy';
    /** For a deploy hook: how long to wait for more changes before calling it (0–600, default 30). */
    batchSeconds?: number;
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
    | RadarPayloadData
    | NavigationPayloadData
    | RedirectsPayloadData;

export type NavigationPayloadData = {
    navigationId: string;
    handle: string;
    updatedBy: string;
};

export type RedirectsPayloadData = {
    count: number;
    updatedBy: string;
};

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

/** All event types that can trigger a webhook. */
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
    | 'radar.violation.resolved'
    | 'import.completed';

/**
 * Comparison operator for a webhook filter: equals, not equals, in a list, or not in a list.
 */
export type WebhookFilterOperator = 'eq' | 'ne' | 'in' | 'nin';

/**
 * A filter that narrows which events trigger delivery, for example firing only when
 * `modelId` equals `article`.
 */
export type WebhookFilter = {
    field: 'modelId' | 'status' | 'locale' | 'environment' | 'source';
    operator: WebhookFilterOperator;
    value: string | string[];
};

/** Events that change what is live on the site. A deploy hook listens to these by default. */
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

/** A registered webhook endpoint. */
export type Webhook = {
    id: string;
    projectId: string;
    name: string; // Display name, for example "Vercel deploy" or "Slack notify"
    /**
     * `deploy`: a hosting provider's build hook (Vercel, Netlify, Cloudflare Pages and similar).
     * Changes that occur within `batchSeconds` of the first one trigger a single build.
     * `webhook` (the default) makes one call per event.
     */
    kind?: 'webhook' | 'deploy';
    /** Deploy hooks only. Seconds to wait for further changes before calling the hook, from 0 to 600. Defaults to 30. */
    batchSeconds?: number;
    url: string; // Target HTTPS endpoint
    secret: string; // Used to sign payloads. Stored encrypted
    events: WebhookEvent[]; // Events that trigger the webhook. An empty array means all events
    filters: WebhookFilter[]; // Additional filters. An empty array means no filtering
    headers: Record<string, string>; // Custom headers sent with every request
    enabled: boolean; // When false, the webhook is disabled without being deleted
    createdAt: string;
    updatedAt: string;
    createdBy: string;
};

/** Delivery state of a webhook call. */
export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'retrying';

/** The record of one webhook delivery, including its retry state. */
export type WebhookDelivery = {
    id: string;
    webhookId: string;
    projectId: string;

    // The request sent
    event: WebhookEvent;
    payload: WebhookPayload; // The full payload that was sent or will be sent

    // Outcome of the most recent attempt
    status: WebhookDeliveryStatus;
    responseStatus?: number; // HTTP status returned by the receiving endpoint
    responseBody?: string; // First 1000 characters of the response body
    durationMs?: number;

    // Retry state
    attemptCount: number; // Starts at 1
    nextRetryAt?: string; // ISO 8601 timestamp. Null when no further retries are planned
    lastAttemptAt?: string;

    createdAt: string; // When the delivery was first queued
};

/** The payload envelope sent to the receiving endpoint. */
export type WebhookPayload = {
    id: string; // Unique delivery ID, equal to `WebhookDelivery.id`
    event: WebhookEvent;
    timestamp: string; // ISO 8601 UTC
    projectId: string;
    environment?: string; // Environment that triggered the event
    source: 'studio' | 'api' | 'scheduler';
    data: WebhookPayloadData;
    test?: boolean; // True for test ping payloads
};

/** The event-specific data in a payload, by event type. */
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

// Re-exported so consumers can import webhook and Radar types from one module.
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

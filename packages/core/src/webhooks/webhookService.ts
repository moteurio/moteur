import crypto from 'crypto';
import { randomUUID } from 'crypto';
import type {
    Webhook,
    WebhookDelivery,
    WebhookDeliveryStatus,
    WebhookEvent,
    WebhookFilter,
    WebhookPayload,
    WebhookPayloadData,
    EntryPayloadData,
    ReviewPayloadData,
    CommentPayloadData,
    RadarPayloadData
} from '@moteurio/types/Webhook.js';
import { getProjectJson, putProjectJson } from '../utils/projectStorage.js';
import { WEBHOOKS_KEY, WEBHOOK_LOG_KEY } from '../utils/storageKeys.js';
import { encryptSecret, decryptSecret } from './secretEncryption.js';

const REDACTED_SECRET = '***';
const DELIVERY_LOG_MAX = 500;
const REQUEST_TIMEOUT_MS = 10_000;
const RESPONSE_BODY_MAX_CHARS = 1000;

// Retry delays in ms: index N = delay before (N+1)th attempt. Attempt 2: 30s, 3: 5min, 4: 30min, 5: 2hr; after 5 = stop
const RETRY_DELAYS_MS: number[] = [0, 30_000, 300_000, 1_800_000, 7_200_000];
const MAX_ATTEMPTS = 5;

const VALID_EVENTS: WebhookEvent[] = [
    'entry.created',
    'entry.updated',
    'entry.published',
    'entry.unpublished',
    'entry.deleted',
    'entry.scheduled',
    'entry.unscheduled',
    'entry.schedule.failed',
    'asset.created',
    'asset.updated',
    'asset.deleted',
    'page.published',
    'page.unpublished',
    'page.deleted',
    'page.scheduled',
    'page.unscheduled',
    'page.schedule.failed',
    'review.submitted',
    'review.approved',
    'review.rejected',
    'comment.created',
    'form.submitted',
    'radar.violation.created',
    'radar.violation.resolved'
];

const FILTER_FIELDS = ['modelId', 'status', 'locale', 'environment', 'source'] as const;
const FILTER_OPERATORS = ['eq', 'ne', 'in', 'nin'] as const;

function redactSecret(w: Webhook): Webhook {
    return { ...w, secret: REDACTED_SECRET };
}

function isHttpsOrLocalhost(urlStr: string): boolean {
    try {
        const u = new URL(urlStr);
        if (u.protocol === 'https:') return true;
        if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
            return process.env.NODE_ENV !== 'production';
        }
        return false;
    } catch {
        return false;
    }
}

function validateUrl(url: string): void {
    if (!url || typeof url !== 'string') throw new Error('URL is required');
    if (!isHttpsOrLocalhost(url)) {
        throw new Error('URL must be HTTPS (or HTTP localhost in development only)');
    }
}

function validateEvents(events: WebhookEvent[] | undefined): void {
    if (events === undefined || events === null) return;
    if (!Array.isArray(events)) throw new Error('events must be an array');
    for (const e of events) {
        if (!VALID_EVENTS.includes(e)) {
            throw new Error(`Invalid event: ${e}. Valid: ${VALID_EVENTS.join(', ')}`);
        }
    }
}

function validateFilters(filters: WebhookFilter[] | undefined): void {
    if (filters === undefined || filters === null) return;
    if (!Array.isArray(filters)) throw new Error('filters must be an array');
    for (const f of filters) {
        if (!FILTER_FIELDS.includes(f.field)) {
            throw new Error(`Invalid filter field: ${f.field}`);
        }
        if (!FILTER_OPERATORS.includes(f.operator)) {
            throw new Error(`Invalid filter operator: ${f.operator}`);
        }
        if (f.operator === 'in' || f.operator === 'nin') {
            if (!Array.isArray(f.value))
                throw new Error('Filter value for in/nin must be an array');
        }
    }
}

export function evaluateFilters(
    filters: WebhookFilter[],
    event: WebhookEvent,
    data: WebhookPayloadData,
    context: { environment?: string; source: string }
): boolean {
    for (const filter of filters) {
        let value: string | undefined;
        switch (filter.field) {
            case 'modelId':
                value =
                    (data as EntryPayloadData | ReviewPayloadData | CommentPayloadData).modelId ??
                    (data as RadarPayloadData).violation?.modelSlug;
                break;
            case 'status':
                value = (data as EntryPayloadData | ReviewPayloadData).status;
                break;
            case 'locale':
                value =
                    (data as EntryPayloadData).locale ??
                    (data as RadarPayloadData).violation?.locale;
                break;
            case 'environment':
                value = context.environment;
                break;
            case 'source':
                value = context.source;
                break;
            default:
                continue;
        }
        // If the field doesn't exist on the data, the filter passes (permissive for inapplicable fields).
        if (value === undefined || value === null) continue;

        let fv: string | string[] = filter.value;
        if ((filter.operator === 'in' || filter.operator === 'nin') && typeof fv === 'string') {
            fv = fv
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        }
        switch (filter.operator) {
            case 'eq':
                if (value !== fv) return false;
                break;
            case 'ne':
                if (value === fv) return false;
                break;
            case 'in':
                if (!Array.isArray(fv) || !fv.includes(value)) return false;
                break;
            case 'nin':
                if (Array.isArray(fv) && fv.includes(value)) return false;
                break;
        }
    }
    return true;
}

async function loadWebhooks(projectId: string): Promise<Webhook[]> {
    const list = await getProjectJson<Webhook[]>(projectId, WEBHOOKS_KEY);
    return Array.isArray(list) ? list : [];
}

async function saveWebhooks(projectId: string, webhooks: Webhook[]): Promise<void> {
    await putProjectJson(projectId, WEBHOOKS_KEY, webhooks);
}

async function loadDeliveryLog(projectId: string): Promise<WebhookDelivery[]> {
    const list = await getProjectJson<WebhookDelivery[]>(projectId, WEBHOOK_LOG_KEY);
    return Array.isArray(list) ? list : [];
}

async function appendDeliveryAndTrim(projectId: string, delivery: WebhookDelivery): Promise<void> {
    const list = await getProjectJson<WebhookDelivery[]>(projectId, WEBHOOK_LOG_KEY);
    const arr = Array.isArray(list) ? list : [];
    const next = [delivery, ...arr];
    const trimmed = next.length > DELIVERY_LOG_MAX ? next.slice(0, DELIVERY_LOG_MAX) : next;
    await putProjectJson(projectId, WEBHOOK_LOG_KEY, trimmed);
}

/** Append multiple deliveries in one read-modify-write to avoid races when dispatching to several webhooks. */
async function appendDeliveriesAndTrim(
    projectId: string,
    newDeliveries: WebhookDelivery[]
): Promise<void> {
    if (newDeliveries.length === 0) return;
    const list = await getProjectJson<WebhookDelivery[]>(projectId, WEBHOOK_LOG_KEY);
    const arr = Array.isArray(list) ? list : [];
    const next = [...newDeliveries, ...arr];
    const trimmed = next.length > DELIVERY_LOG_MAX ? next.slice(0, DELIVERY_LOG_MAX) : next;
    await putProjectJson(projectId, WEBHOOK_LOG_KEY, trimmed);
}

async function updateDeliveryInLog(
    projectId: string,
    deliveryId: string,
    updater: (d: WebhookDelivery) => WebhookDelivery
): Promise<void> {
    const list = await getProjectJson<WebhookDelivery[]>(projectId, WEBHOOK_LOG_KEY);
    const arr = Array.isArray(list) ? list : [];
    const idx = arr.findIndex(d => d.id === deliveryId);
    if (idx === -1) return;
    arr[idx] = updater(arr[idx]!);
    await putProjectJson(projectId, WEBHOOK_LOG_KEY, arr);
}

export async function listWebhooks(projectId: string): Promise<Webhook[]> {
    const list = await loadWebhooks(projectId);
    return list.map(redactSecret);
}

export async function getWebhook(projectId: string, id: string): Promise<Webhook> {
    const list = await loadWebhooks(projectId);
    const w = list.find(x => x.id === id);
    if (!w) throw new Error(`Webhook "${id}" not found`);
    return redactSecret(w);
}

export async function createWebhook(
    projectId: string,
    user: string,
    data: {
        name: string;
        url: string;
        secret?: string;
        events?: WebhookEvent[];
        filters?: WebhookFilter[];
        headers?: Record<string, string>;
        enabled?: boolean;
    }
): Promise<Webhook> {
    validateUrl(data.url);
    validateEvents(data.events);
    validateFilters(data.filters);

    const secret = data.secret ?? crypto.randomBytes(32).toString('hex');
    const encryptedSecret = encryptSecret(secret);

    const now = new Date().toISOString();
    const webhook: Webhook = {
        id: randomUUID(),
        projectId,
        name: data.name.trim(),
        url: data.url.trim(),
        secret: encryptedSecret,
        events: data.events ?? [],
        filters: data.filters ?? [],
        headers: data.headers ?? {},
        enabled: data.enabled ?? true,
        createdAt: now,
        updatedAt: now,
        createdBy: user
    };

    const list = await loadWebhooks(projectId);
    list.push(webhook);
    await saveWebhooks(projectId, list);

    // Return with plaintext secret visible once
    return { ...webhook, secret };
}

export async function updateWebhook(
    projectId: string,
    user: string,
    id: string,
    patch: Partial<Omit<Webhook, 'id' | 'projectId' | 'createdAt' | 'createdBy'>>
): Promise<Webhook> {
    const list = await loadWebhooks(projectId);
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) throw new Error(`Webhook "${id}" not found`);

    if (patch.url !== undefined) validateUrl(patch.url);
    if (patch.events !== undefined) validateEvents(patch.events);
    if (patch.filters !== undefined) validateFilters(patch.filters);

    const current = list[idx]!;
    let secret = current.secret;
    if (patch.secret !== undefined && patch.secret !== REDACTED_SECRET) {
        secret = encryptSecret(patch.secret);
    }

    const updated: Webhook = {
        ...current,
        ...patch,
        id: current.id,
        projectId: current.projectId,
        createdAt: current.createdAt,
        createdBy: current.createdBy,
        secret,
        updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    await saveWebhooks(projectId, list);
    return redactSecret(updated);
}

export async function deleteWebhook(projectId: string, user: string, id: string): Promise<void> {
    const list = await loadWebhooks(projectId);
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) throw new Error(`Webhook "${id}" not found`);
    list.splice(idx, 1);
    await saveWebhooks(projectId, list);
}

export async function rotateSecret(
    projectId: string,
    user: string,
    id: string
): Promise<{ secret: string }> {
    const list = await loadWebhooks(projectId);
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) throw new Error(`Webhook "${id}" not found`);
    const newSecret = crypto.randomBytes(32).toString('hex');
    const encrypted = encryptSecret(newSecret);
    const now = new Date().toISOString();
    list[idx] = { ...list[idx]!, secret: encrypted, updatedAt: now };
    await saveWebhooks(projectId, list);
    return { secret: newSecret };
}

export async function getDeliveryLog(
    projectId: string,
    webhookId: string,
    options?: { limit?: number; offset?: number }
): Promise<WebhookDelivery[]> {
    const list = await loadDeliveryLog(projectId);
    const filtered = list.filter(d => d.webhookId === webhookId);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    return filtered.slice(offset, offset + limit);
}

export async function retryDelivery(
    projectId: string,
    webhookId: string,
    deliveryId: string
): Promise<void> {
    const list = await loadDeliveryLog(projectId);
    const delivery = list.find(d => d.id === deliveryId && d.webhookId === webhookId);
    if (!delivery) throw new Error('Delivery not found');
    if (delivery.status !== 'failed') {
        throw new Error('Only failed deliveries can be retried');
    }
    const webhooks = await loadWebhooks(projectId);
    const webhook = webhooks.find(w => w.id === webhookId);
    if (!webhook || !webhook.enabled) throw new Error('Webhook not found or disabled');

    const requeued: WebhookDelivery = {
        ...delivery,
        status: 'pending',
        attemptCount: 0,
        nextRetryAt: undefined,
        lastAttemptAt: undefined,
        responseStatus: undefined,
        responseBody: undefined,
        durationMs: undefined
    };
    await updateDeliveryInLog(projectId, deliveryId, () => requeued);
    scheduleDelivery(requeued, webhook);
}

function computeSignature(secret: string, rawBody: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    return 'sha256=' + hmac.digest('hex');
}

// v1: Retries use setTimeout; they are lost on server restart. Consider a persistent queue for production.
function scheduleDelivery(delivery: WebhookDelivery, webhook: Webhook): void {
    const run = () => {
        attemptDelivery(delivery, webhook).catch(() => {
            // Errors are recorded on the delivery; never throw
        });
    };
    setTimeout(run, 0);
}

async function attemptDelivery(delivery: WebhookDelivery, webhook: Webhook): Promise<void> {
    const projectId = webhook.projectId;
    const secret = decryptSecret(webhook.secret);
    const payload = delivery.payload;
    const rawBody = JSON.stringify(payload);
    const signature = computeSignature(secret, rawBody);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Moteur signing headers must take precedence; merge custom headers first so ours overwrite
    const headers: Record<string, string> = {
        ...webhook.headers,
        'Content-Type': 'application/json',
        'X-Moteur-Event': payload.event,
        'X-Moteur-Delivery': delivery.id,
        'X-Moteur-Signature': signature,
        'X-Moteur-Timestamp': timestamp
    };

    const start = Date.now();
    let responseStatus: number | undefined;
    let responseBody: string | undefined;
    let success = false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: rawBody,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        responseStatus = res.status;
        const text = await res.text();
        responseBody = text.slice(0, RESPONSE_BODY_MAX_CHARS);
        success = res.ok;
    } catch (err) {
        responseStatus = undefined;
        responseBody = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - start;
    const nextAttempt = delivery.attemptCount + 1;
    const lastAttemptAt = new Date().toISOString();

    if (success) {
        await updateDeliveryInLog(projectId, delivery.id, d => ({
            ...d,
            status: 'success' as WebhookDeliveryStatus,
            responseStatus,
            responseBody,
            durationMs,
            lastAttemptAt
        }));
        return;
    }

    // Failure: schedule retry or mark failed (delay before next attempt: index nextAttempt = 30s, 5min, 30min, 2hr)
    const delayMs =
        nextAttempt < MAX_ATTEMPTS && nextAttempt < RETRY_DELAYS_MS.length
            ? RETRY_DELAYS_MS[nextAttempt]!
            : 0;
    const willRetry = nextAttempt < MAX_ATTEMPTS;

    await updateDeliveryInLog(projectId, delivery.id, d => ({
        ...d,
        status: willRetry
            ? ('retrying' as WebhookDeliveryStatus)
            : ('failed' as WebhookDeliveryStatus),
        attemptCount: nextAttempt,
        responseStatus,
        responseBody,
        durationMs,
        lastAttemptAt,
        nextRetryAt: willRetry ? new Date(Date.now() + delayMs).toISOString() : undefined
    }));

    if (willRetry && delayMs > 0) {
        setTimeout(() => {
            getProjectJson<WebhookDelivery[]>(projectId, WEBHOOK_LOG_KEY).then(list => {
                const arr = Array.isArray(list) ? list : [];
                const d = arr.find(x => x.id === delivery.id);
                if (d && d.status === 'retrying') {
                    loadWebhooks(projectId).then(webhooks => {
                        const w = webhooks.find(x => x.id === webhook.id);
                        if (w && w.enabled) attemptDelivery(d, w).catch(() => {});
                    });
                }
            });
        }, delayMs);
    }
}

// form.submitted is not wired: no form service exists in the repo. Wire dispatch('form.submitted', ...) when the Forms feature is implemented.
export async function dispatch(
    event: WebhookEvent,
    data: WebhookPayloadData,
    context: {
        projectId: string;
        environment?: string;
        source: 'studio' | 'api' | 'scheduler';
    }
): Promise<void> {
    try {
        const webhooks = await loadWebhooks(context.projectId);
        const enabled = webhooks.filter(w => w.enabled);

        const deliveries: { delivery: WebhookDelivery; webhook: Webhook }[] = [];
        for (const webhook of enabled) {
            if (webhook.events.length > 0 && !webhook.events.includes(event)) continue;
            if (!evaluateFilters(webhook.filters, event, data, context)) continue;

            const timestamp = new Date().toISOString();
            const deliveryId = randomUUID();
            const payload: WebhookPayload = {
                id: deliveryId,
                event,
                timestamp,
                projectId: context.projectId,
                environment: context.environment,
                source: context.source,
                data
            };

            const delivery: WebhookDelivery = {
                id: deliveryId,
                webhookId: webhook.id,
                projectId: context.projectId,
                event,
                payload,
                status: 'pending',
                attemptCount: 0,
                createdAt: timestamp
            };

            deliveries.push({ delivery, webhook });
        }

        if (deliveries.length > 0) {
            await appendDeliveriesAndTrim(
                context.projectId,
                deliveries.map(({ delivery }) => delivery)
            );
            for (const { delivery, webhook } of deliveries) {
                scheduleDelivery(delivery, webhook);
            }
        }
    } catch {
        // dispatch must never throw — fire-and-forget
    }
}

export async function sendTestPing(projectId: string, webhookId: string): Promise<WebhookDelivery> {
    const webhooks = await loadWebhooks(projectId);
    const webhook = webhooks.find(w => w.id === webhookId);
    if (!webhook) throw new Error(`Webhook "${webhookId}" not found`);

    const timestamp = new Date().toISOString();
    const payload: WebhookPayload = {
        id: '',
        event: 'entry.published',
        timestamp,
        projectId,
        source: 'studio',
        data: {
            entryId: '_test_',
            modelId: '_test_',
            status: 'published',
            updatedBy: '_test_'
        },
        test: true
    };

    const deliveryId = randomUUID();
    payload.id = deliveryId;

    const delivery: WebhookDelivery = {
        id: deliveryId,
        webhookId: webhook.id,
        projectId,
        event: 'entry.published',
        payload,
        status: 'pending',
        attemptCount: 0,
        createdAt: timestamp
    };

    await appendDeliveryAndTrim(projectId, delivery);
    scheduleDelivery(delivery, webhook);

    // Wait for first attempt to complete (poll briefly)
    const deadline = Date.now() + REQUEST_TIMEOUT_MS + 2000;
    while (Date.now() < deadline) {
        const list = await loadDeliveryLog(projectId);
        const d = list.find(x => x.id === deliveryId);
        if (d && d.status !== 'pending') {
            return d;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    const list = await loadDeliveryLog(projectId);
    const d = list.find(x => x.id === deliveryId);
    return d ?? delivery;
}

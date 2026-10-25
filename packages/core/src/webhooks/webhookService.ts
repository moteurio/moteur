import { loadProjects } from '../projects.js';
import { projectDir } from '../utils/pathUtils.js';
import { withWriteLock } from '../utils/projectWriteLock.js';
import { WorkBudget } from '../utils/workBudget.js';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { validateUrl } from './networkPolicy.js';
import { postWebhook } from './outboundHttp.js';
export { assertPublicHttpsUrl } from './networkPolicy.js';
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
import { listPluginOutboundWebhookEvents } from '../plugins/outboundEvents.js';
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

function validateEvents(events: WebhookEvent[] | undefined): void {
    if (events === undefined || events === null) return;
    if (!Array.isArray(events)) throw new Error('events must be an array');
    const allowed = new Set<string>([...VALID_EVENTS, ...listPluginOutboundWebhookEvents()]);
    for (const e of events) {
        if (!allowed.has(e)) {
            throw new Error(`Invalid event: ${e}. Valid: ${[...allowed].join(', ')}`);
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
    if (list != null && !Array.isArray(list)) throw new Error('Invalid webhook registry');
    return Array.isArray(list) ? list : [];
}

async function saveWebhooks(projectId: string, webhooks: Webhook[]): Promise<void> {
    await putProjectJson(projectId, WEBHOOKS_KEY, webhooks);
}

async function loadDeliveryLog(projectId: string): Promise<WebhookDelivery[]> {
    const list = await getProjectJson<WebhookDelivery[]>(projectId, WEBHOOK_LOG_KEY);
    if (list != null && !Array.isArray(list)) throw new Error('Invalid webhook outbox');
    return Array.isArray(list) ? list : [];
}

async function appendDeliveryAndTrim(projectId: string, delivery: WebhookDelivery): Promise<void> {
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOK_LOG_KEY}`, () =>
        appendDeliveryAndTrimUnlocked(projectId, delivery)
    );
}

async function appendDeliveryAndTrimUnlocked(
    projectId: string,
    delivery: WebhookDelivery
): Promise<void> {
    const arr = await loadDeliveryLog(projectId);
    const next = [delivery, ...arr];
    const trimmed = retainDeliveries(next);
    await putProjectJson(projectId, WEBHOOK_LOG_KEY, trimmed);
}

/** Append multiple deliveries in one read-modify-write to avoid races when dispatching to several webhooks. */
async function appendDeliveriesAndTrim(
    projectId: string,
    newDeliveries: WebhookDelivery[]
): Promise<void> {
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOK_LOG_KEY}`, () =>
        appendDeliveriesAndTrimUnlocked(projectId, newDeliveries)
    );
}

async function appendDeliveriesAndTrimUnlocked(
    projectId: string,
    newDeliveries: WebhookDelivery[]
): Promise<void> {
    if (newDeliveries.length === 0) return;
    const arr = await loadDeliveryLog(projectId);
    const next = [...newDeliveries, ...arr];
    const trimmed = retainDeliveries(next);
    await putProjectJson(projectId, WEBHOOK_LOG_KEY, trimmed);
}

async function updateDeliveryInLog(
    projectId: string,
    deliveryId: string,
    updater: (d: WebhookDelivery) => WebhookDelivery
): Promise<void> {
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOK_LOG_KEY}`, () =>
        updateDeliveryInLogUnlocked(projectId, deliveryId, updater)
    );
}

async function updateDeliveryInLogUnlocked(
    projectId: string,
    deliveryId: string,
    updater: (d: WebhookDelivery) => WebhookDelivery
): Promise<void> {
    const arr = await loadDeliveryLog(projectId);
    const idx = arr.findIndex(d => d.id === deliveryId);
    if (idx === -1) return;
    arr[idx] = updater(arr[idx]!);
    await putProjectJson(projectId, WEBHOOK_LOG_KEY, retainDeliveries(arr));
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
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOKS_KEY}`, () =>
        createWebhookUnlocked(projectId, user, data)
    );
}

async function createWebhookUnlocked(
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
    await validateUrl(data.url);
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
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOKS_KEY}`, () =>
        updateWebhookUnlocked(projectId, user, id, patch)
    );
}

async function updateWebhookUnlocked(
    projectId: string,
    user: string,
    id: string,
    patch: Partial<Omit<Webhook, 'id' | 'projectId' | 'createdAt' | 'createdBy'>>
): Promise<Webhook> {
    const list = await loadWebhooks(projectId);
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) throw new Error(`Webhook "${id}" not found`);

    if (patch.url !== undefined) await validateUrl(patch.url);
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
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOKS_KEY}`, () =>
        deleteWebhookUnlocked(projectId, user, id)
    );
}

async function deleteWebhookUnlocked(projectId: string, user: string, id: string): Promise<void> {
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
    return withWriteLock(`${projectDir(projectId)}/${WEBHOOKS_KEY}`, () =>
        rotateSecretUnlocked(projectId, user, id)
    );
}

async function rotateSecretUnlocked(
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

let deliveryEpoch = 0;
let recoveryTask: Promise<void> | undefined;
const deliveryTimers = new Map<string, NodeJS.Timeout>();
const runningDeliveries = new Set<string>();
const idleWaiters: Array<() => void> = [];
const deliveryBudget = new WorkBudget(4, 16);
let deliverySweep: NodeJS.Timeout | undefined;
const activeDelivery = (delivery: WebhookDelivery) =>
    delivery.status === 'pending' || delivery.status === 'retrying';

function retainDeliveries(deliveries: WebhookDelivery[]): WebhookDelivery[] {
    // Terminal history can be trimmed. Pending work must survive a busy project's log rotation.
    return [
        ...deliveries.filter(activeDelivery),
        ...deliveries.filter(d => !activeDelivery(d)).slice(0, DELIVERY_LOG_MAX)
    ];
}

function scheduleDelivery(delivery: WebhookDelivery, webhook: Webhook): void {
    const epoch = deliveryEpoch;
    const key = `${delivery.projectId}:${delivery.id}`;
    if (deliveryTimers.has(key) || runningDeliveries.has(key)) return;
    const delay = Math.max(0, Date.parse(delivery.nextRetryAt ?? '') - Date.now()) || 0;
    const timer = setTimeout(
        () => {
            deliveryTimers.delete(key);
            if (runningDeliveries.has(key)) return;
            runningDeliveries.add(key);
            void deliveryBudget
                .run(async () => {
                    if (epoch !== deliveryEpoch) return;
                    const latest = (await loadDeliveryLog(delivery.projectId)).find(
                        d => d.id === delivery.id
                    );
                    if (!latest || !activeDelivery(latest)) return;
                    const current = (await loadWebhooks(delivery.projectId)).find(
                        w => w.id === webhook.id
                    );
                    if (!current?.enabled) {
                        await updateDeliveryInLog(delivery.projectId, delivery.id, d => ({
                            ...d,
                            status: 'failed',
                            responseBody: 'Webhook removed or disabled',
                            nextRetryAt: undefined
                        }));
                        return;
                    }
                    if (Date.parse(latest.nextRetryAt ?? '') > Date.now()) return;
                    await attemptDelivery(latest, current, epoch);
                })
                .catch(error => {
                    if (error?.status !== 429)
                        console.error('[Webhooks] Delivery will recover on the next sweep:', error);
                })
                .finally(() => {
                    runningDeliveries.delete(key);
                    if (runningDeliveries.size === 0)
                        for (const waiter of idleWaiters.splice(0)) waiter();
                });
        },
        Math.min(delay, 2 ** 31 - 1)
    );
    timer.unref?.();
    deliveryTimers.set(key, timer);
}

/** Resume persisted pending/retrying records, including a lease left by a stopped process. */
export function recoverWebhookDeliveries(): Promise<void> {
    recoveryTask ??= scanWebhookOutbox(deliveryEpoch).finally(() => {
        recoveryTask = undefined;
    });
    return recoveryTask;
}
async function scanWebhookOutbox(epoch: number): Promise<void> {
    for (const project of loadProjects()) {
        try {
            const hooks = await loadWebhooks(project.id);
            if (epoch !== deliveryEpoch) return;
            for (const delivery of await loadDeliveryLog(project.id)) {
                if (epoch !== deliveryEpoch) return;
                if (!activeDelivery(delivery)) continue;
                const hook = hooks.find(w => w.id === delivery.webhookId);
                if (hook) scheduleDelivery(delivery, hook);
                else
                    await updateDeliveryInLog(project.id, delivery.id, d => ({
                        ...d,
                        status: 'failed',
                        responseBody: 'Webhook removed',
                        nextRetryAt: undefined
                    }));
            }
        } catch {
            console.error('[Webhooks] Outbox recovery failed for project', project.id);
        }
    }
}
export async function startWebhookWorker(): Promise<void> {
    if (deliverySweep) return;
    await recoverWebhookDeliveries().catch(() =>
        console.error('[Webhooks] Initial recovery failed; will retry.')
    );
    deliverySweep = setInterval(() => {
        void recoverWebhookDeliveries().catch(error =>
            console.error('[Webhooks] Recovery failed:', error)
        );
    }, 5000);
    deliverySweep.unref?.();
}
export function stopWebhookWorker(): void {
    deliveryEpoch++;
    if (deliverySweep) clearInterval(deliverySweep);
    deliverySweep = undefined;
    for (const timer of deliveryTimers.values()) clearTimeout(timer);
    deliveryTimers.clear();
}
export function whenWebhooksIdle(): Promise<void> {
    return runningDeliveries.size === 0
        ? Promise.resolve()
        : new Promise(resolve => idleWaiters.push(resolve));
}

async function attemptDelivery(
    delivery: WebhookDelivery,
    webhook: Webhook,
    epoch: number
): Promise<void> {
    const projectId = webhook.projectId;
    const secret = decryptSecret(webhook.secret);
    const start = Date.now();
    const nextAttempt = delivery.attemptCount + 1;
    if (nextAttempt > MAX_ATTEMPTS) {
        await updateDeliveryInLog(projectId, delivery.id, d => ({
            ...d,
            status: 'failed',
            nextRetryAt: undefined
        }));
        return;
    }
    // Claim durably before sending. A crash consumes an attempt; its lease becomes due again.
    await updateDeliveryInLog(projectId, delivery.id, d => ({
        ...d,
        attemptCount: nextAttempt,
        lastAttemptAt: new Date().toISOString(),
        nextRetryAt: new Date(Date.now() + 30_000).toISOString()
    }));

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
    let responseStatus: number | undefined;
    let responseBody: string | undefined;
    let success = false;

    try {
        const res = await postWebhook(
            webhook.url,
            headers,
            rawBody,
            REQUEST_TIMEOUT_MS,
            RESPONSE_BODY_MAX_CHARS
        );
        responseStatus = res.status;
        responseBody = res.body;
        success = res.status >= 200 && res.status < 300;
    } catch (err) {
        responseStatus = undefined;
        responseBody = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - start;
    const lastAttemptAt = new Date().toISOString();

    if (success) {
        await updateDeliveryInLog(projectId, delivery.id, d => ({
            ...d,
            status: 'success' as WebhookDeliveryStatus,
            attemptCount: nextAttempt,
            nextRetryAt: undefined,
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

    if (willRetry && delayMs > 0 && epoch === deliveryEpoch) {
        // The persisted retry date survives restart; this timer only reduces local latency.
        const retry = setTimeout(() => {
            deliveryTimers.delete(`${projectId}:${delivery.id}`);
            scheduleDelivery({ ...delivery, nextRetryAt: new Date().toISOString() }, webhook);
        }, delayMs);
        retry.unref?.();
        deliveryTimers.set(`${projectId}:${delivery.id}`, retry);
    }
}

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
        console.error('[Webhooks] Event could not be persisted for project', context.projectId);
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

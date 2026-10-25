import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    createWebhook,
    dispatch,
    recoverWebhookDeliveries,
    stopWebhookWorker,
    whenWebhooksIdle
} from '../../src/webhooks/webhookService.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { WEBHOOK_LOG_KEY } from '../../src/utils/storageKeys.js';
import type { WebhookDelivery } from '@moteurio/types/Webhook.js';
const send = vi.hoisted(() => vi.fn());
vi.mock('../../src/webhooks/outboundHttp.js', () => ({ postWebhook: send }));
vi.mock('node:dns/promises', () => ({
    default: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] }
}));

describe('durable webhook delivery', () => {
    let root: string;
    let hookId: string;
    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-outbox-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'a'.repeat(64));
        await putProjectJson('p1', 'project.json', { id: 'p1', users: [] });
        hookId = (
            await createWebhook('p1', 'u1', { name: 'Receiver', url: 'https://receiver.test/hook' })
        ).id;
        send.mockReset().mockResolvedValue({ status: 200, body: 'OK' });
    });
    afterEach(async () => {
        stopWebhookWorker();
        await whenWebhooksIdle();
        vi.useRealTimers();
        vi.unstubAllEnvs();
        await fs.rm(root, { recursive: true, force: true });
    });
    const event = { entryId: 'e1', modelId: 'articles', status: 'draft', updatedBy: 'u1' };
    async function log() {
        return (await getProjectJson<WebhookDelivery[]>('p1', WEBHOOK_LOG_KEY)) ?? [];
    }
    it('resumes a persisted delivery after process timers have been discarded', async () => {
        await dispatch('entry.created', event, { projectId: 'p1' });
        stopWebhookWorker();
        expect(send).not.toHaveBeenCalled();
        expect((await log())[0].status).toBe('pending');
        await recoverWebhookDeliveries();
        await vi.waitFor(async () => expect((await log())[0].status).toBe('success'));
        expect(send).toHaveBeenCalledOnce();
        expect((await log())[0].attemptCount).toBe(1);
    });
    it('keeps retry deadlines and attempt counts across restart, without duplicate sends', async () => {
        await dispatch('entry.created', event, { projectId: 'p1' });
        stopWebhookWorker();
        const delivery = (await log())[0];
        vi.useFakeTimers();
        delivery.status = 'retrying';
        delivery.attemptCount = 1;
        delivery.nextRetryAt = new Date(Date.now() + 30_000).toISOString();
        await putProjectJson('p1', WEBHOOK_LOG_KEY, [delivery]);
        await recoverWebhookDeliveries();
        stopWebhookWorker();
        await Promise.all([recoverWebhookDeliveries(), recoverWebhookDeliveries()]);
        await vi.advanceTimersByTimeAsync(29_000);
        expect(send).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        await vi.waitFor(async () => expect((await log())[0].status).toBe('success'));
        expect(send).toHaveBeenCalledOnce();
        expect((await log())[0].attemptCount).toBe(2);
    });
    it('retains pending work when completed history is trimmed', async () => {
        const pending = {
            id: 'pending',
            projectId: 'p1',
            webhookId: hookId,
            status: 'retrying',
            attemptCount: 1,
            nextRetryAt: new Date(Date.now() + 300_000).toISOString()
        } as WebhookDelivery;
        const history = Array.from({ length: 500 }, (_, i) => ({
            ...pending,
            id: `done-${i}`,
            status: 'success' as const
        }));
        await putProjectJson('p1', WEBHOOK_LOG_KEY, [...history, pending]);
        await dispatch('entry.created', event, { projectId: 'p1' });
        stopWebhookWorker();
        expect((await log()).find(d => d.id === 'pending')?.status).toBe('retrying');
        expect((await log()).filter(d => d.status === 'success')).toHaveLength(500);
    });
    it('does not lose one of two concurrent enqueue operations', async () => {
        await Promise.all([
            dispatch('entry.created', event, { projectId: 'p1' }),
            dispatch('entry.updated', event, { projectId: 'p1' })
        ]);
        stopWebhookWorker();
        expect((await log()).map(d => d.event).sort()).toEqual(['entry.created', 'entry.updated']);
    });
});

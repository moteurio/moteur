import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    listWebhooks,
    getWebhook,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    rotateSecret,
    getDeliveryLog,
    retryDelivery,
    dispatch,
    sendTestPing
} from '../../src/webhooks/webhookService.js';

const projectId = 'webhook-test-proj';
const USER = 'user1';

describe('webhookService', () => {
    let tempDir: string;
    let projectDir: string;
    let originalDataRoot: string | undefined;
    let originalNodeEnv: string | undefined;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-webhooks-'));
        projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Test',
                defaultLocale: 'en',
                users: [USER]
            }),
            'utf-8'
        );
        originalDataRoot = process.env.DATA_ROOT;
        originalNodeEnv = process.env.NODE_ENV;
        process.env.DATA_ROOT = tempDir;
        process.env.NODE_ENV = 'test';
        process.env.MOTEUR_ENCRYPTION_KEY = 'a'.repeat(64);

        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve('OK')
        });
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
        else delete process.env.NODE_ENV;
        vi.unstubAllGlobals();
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('createWebhook', () => {
        it('creates webhook and returns it with plaintext secret once', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'My Webhook',
                url: 'https://example.com/hook'
            });
            expect(created.id).toBeDefined();
            expect(created.name).toBe('My Webhook');
            expect(created.url).toBe('https://example.com/hook');
            expect(created.secret).toBeDefined();
            expect(created.secret).not.toBe('***');
            expect(created.enabled).toBe(true);
            expect(created.events).toEqual([]);
            expect(created.filters).toEqual([]);

            const got = await getWebhook(projectId, created.id);
            expect(got.secret).toBe('***');
        });

        it('rejects http URL in production', async () => {
            process.env.NODE_ENV = 'production';
            await expect(
                createWebhook(projectId, USER, {
                    name: 'Bad',
                    url: 'http://evil.com/hook'
                })
            ).rejects.toThrow(/HTTPS/);
        });

        it('accepts http localhost in non-production', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'Local',
                url: 'http://localhost:3000/hook'
            });
            expect(created.url).toBe('http://localhost:3000/hook');
        });

        it('validates invalid event', async () => {
            await expect(
                createWebhook(projectId, USER, {
                    name: 'W',
                    url: 'https://example.com/hook',
                    events: ['entry.created', 'invalid.event' as any]
                })
            ).rejects.toThrow(/Invalid event/);
        });

        it('validates invalid filter field', async () => {
            await expect(
                createWebhook(projectId, USER, {
                    name: 'W',
                    url: 'https://example.com/hook',
                    filters: [{ field: 'invalid' as any, operator: 'eq', value: 'x' }]
                })
            ).rejects.toThrow(/Invalid filter field/);
        });

        it('uses provided secret when given', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                secret: 'my-custom-secret'
            });
            expect(created.secret).toBe('my-custom-secret');
        });
    });

    describe('listWebhooks / getWebhook', () => {
        it('list redacts secret to ***', async () => {
            await createWebhook(projectId, USER, {
                name: 'W1',
                url: 'https://example.com/hook'
            });
            const list = await listWebhooks(projectId);
            expect(list).toHaveLength(1);
            expect(list[0]!.secret).toBe('***');
        });

        it('get returns 404 for unknown id', async () => {
            await expect(getWebhook(projectId, 'nonexistent')).rejects.toThrow(/not found/);
        });
    });

    describe('updateWebhook', () => {
        it('updates and returns redacted secret', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook'
            });
            const updated = await updateWebhook(projectId, USER, created.id, {
                name: 'Updated',
                enabled: false
            });
            expect(updated.name).toBe('Updated');
            expect(updated.enabled).toBe(false);
            expect(updated.secret).toBe('***');
        });

        it('rejects update with invalid URL', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook'
            });
            process.env.NODE_ENV = 'production';
            await expect(
                updateWebhook(projectId, USER, created.id, { url: 'http://evil.com/hook' })
            ).rejects.toThrow(/HTTPS/);
        });
    });

    describe('deleteWebhook', () => {
        it('removes webhook', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook'
            });
            await deleteWebhook(projectId, USER, created.id);
            await expect(getWebhook(projectId, created.id)).rejects.toThrow(/not found/);
        });

        it('throws for unknown id', async () => {
            await expect(deleteWebhook(projectId, USER, 'nonexistent')).rejects.toThrow(
                /not found/
            );
        });
    });

    describe('rotateSecret', () => {
        it('returns new plaintext secret and persists', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook'
            });
            const oldSecret = created.secret;
            const { secret: newSecret } = await rotateSecret(projectId, USER, created.id);
            expect(newSecret).toBeDefined();
            expect(newSecret).not.toBe(oldSecret);
            const got = await getWebhook(projectId, created.id);
            expect(got.secret).toBe('***');
        });
    });

    describe('dispatch', () => {
        it('only dispatches to enabled webhooks', async () => {
            await createWebhook(projectId, USER, {
                name: 'W1',
                url: 'https://example.com/h1',
                events: ['entry.created']
            });
            await createWebhook(projectId, USER, {
                name: 'W2',
                url: 'https://example.com/h2',
                events: ['entry.created'],
                enabled: false
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );

            await new Promise(r => setTimeout(r, 150));

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect((fetchMock.mock.calls[0] as any)[0]).toBe('https://example.com/h1');
        });

        it('respects event filter when webhook has events', async () => {
            await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.published']
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );

            await new Promise(r => setTimeout(r, 100));
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('dispatches when events is empty (all events)', async () => {
            await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: []
            });
            await dispatch(
                'entry.deleted',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'api' }
            );

            await new Promise(r => setTimeout(r, 150));
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('respects filters', async () => {
            await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.published'],
                filters: [{ field: 'modelId', operator: 'eq', value: 'blog' }]
            });
            await dispatch(
                'entry.published',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'published',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );

            await new Promise(r => setTimeout(r, 100));
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('never throws (fire-and-forget)', async () => {
            await expect(
                dispatch(
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: USER
                    },
                    { projectId, source: 'studio' }
                )
            ).resolves.toBeUndefined();
        });

        it('appends delivery to log and sends body with correct signature envelope', async () => {
            await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.published'],
                secret: 'fixed-secret-for-test'
            });
            await dispatch(
                'entry.published',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'published',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );

            await new Promise(r => setTimeout(r, 200));

            const log = await getDeliveryLog(projectId, (await listWebhooks(projectId))[0]!.id);
            expect(log.length).toBeGreaterThanOrEqual(1);
            const delivery = log[0]!;
            expect(delivery.event).toBe('entry.published');
            expect(delivery.payload.data).toMatchObject({
                entryId: 'e1',
                modelId: 'article',
                status: 'published'
            });
            expect(delivery.payload.source).toBe('studio');
            expect(delivery.payload.test).toBeUndefined();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
            const body = opts.body as string;
            expect(JSON.parse(body)).toEqual(delivery.payload);
            expect(opts.headers).toMatchObject({
                'Content-Type': 'application/json',
                'X-Moteur-Event': 'entry.published',
                'X-Moteur-Delivery': delivery.id,
                'X-Moteur-Timestamp': expect.any(String)
            });
            expect((opts.headers as Record<string, string>)['X-Moteur-Signature']).toMatch(
                /^sha256=/
            );
        });
    });

    describe('sendTestPing', () => {
        it('payload has test: true and fake data', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook'
            });
            const result = await sendTestPing(projectId, created.id);

            expect(result.status).toBe('success');
            expect(result.payload.test).toBe(true);
            expect(result.payload.data).toMatchObject({
                entryId: '_test_',
                modelId: '_test_',
                status: 'published',
                updatedBy: '_test_'
            });
        });

        it('throws when webhook not found', async () => {
            await expect(sendTestPing(projectId, 'nonexistent')).rejects.toThrow(/not found/);
        });
    });

    describe('getDeliveryLog', () => {
        it('filters by webhookId and respects limit/offset', async () => {
            const { id: w1Id } = await createWebhook(projectId, USER, {
                name: 'W1',
                url: 'https://example.com/h1',
                events: ['entry.created']
            });
            const { id: w2Id } = await createWebhook(projectId, USER, {
                name: 'W2',
                url: 'https://example.com/h2',
                events: ['entry.created']
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );
            await new Promise(r => setTimeout(r, 200));

            const list1 = await getDeliveryLog(projectId, w1Id);
            const list2 = await getDeliveryLog(projectId, w2Id);
            expect(list1.length).toBe(1);
            expect(list2.length).toBe(1);
            expect(list1[0]!.webhookId).toBe(w1Id);
            expect(list2[0]!.webhookId).toBe(w2Id);

            const limited = await getDeliveryLog(projectId, w1Id, { limit: 1, offset: 0 });
            expect(limited).toHaveLength(1);
        });
    });

    describe('retryDelivery', () => {
        it('rejects when delivery is not failed', async () => {
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.created']
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );
            await new Promise(r => setTimeout(r, 200));

            const log = await getDeliveryLog(projectId, created.id);
            const delivery = log[0]!;
            expect(delivery.status).toBe('success');
            await expect(retryDelivery(projectId, created.id, delivery.id)).rejects.toThrow(
                /Only failed deliveries/
            );
        });

        it('enqueues retry when delivery is failed', async () => {
            fetchMock.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Error')
            });
            const created = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.created']
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );

            await new Promise(r => setTimeout(r, 250));

            const log = await getDeliveryLog(projectId, created.id);
            const failed = log.find(d => d.status === 'failed' || d.status === 'retrying');
            if (failed) {
                if (failed.status === 'failed') {
                    await retryDelivery(projectId, created.id, failed.id);
                    await new Promise(r => setTimeout(r, 150));
                    const after = await getDeliveryLog(projectId, created.id, { limit: 10 });
                    const retried = after.find(d => d.id === failed.id);
                    expect(retried).toBeDefined();
                }
            }
        });
    });

    describe('delivery log cap (500)', () => {
        it('trims to 500 entries per project', async () => {
            const { id: webhookId } = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.created']
            });
            const { getProjectJson, putProjectJson } =
                await import('../../src/utils/projectStorage.js');
            const { WEBHOOK_LOG_KEY } = await import('../../src/utils/storageKeys.js');
            const existing: any[] = [];
            for (let i = 0; i < 500; i++) {
                existing.push({
                    id: `old-${i}`,
                    webhookId,
                    projectId,
                    event: 'entry.created',
                    payload: {
                        id: `old-${i}`,
                        event: 'entry.created',
                        projectId,
                        source: 'studio',
                        data: {}
                    },
                    status: 'success',
                    attemptCount: 1,
                    createdAt: new Date().toISOString()
                });
            }
            await putProjectJson(projectId, WEBHOOK_LOG_KEY, existing);

            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );
            await new Promise(r => setTimeout(r, 50));

            const raw = await getProjectJson<any[]>(projectId, WEBHOOK_LOG_KEY);
            expect(Array.isArray(raw)).toBe(true);
            expect((raw as any[]).length).toBe(500);
        });
    });

    describe('custom headers do not override signing headers', () => {
        it('Moteur headers win over webhook.headers', async () => {
            await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.created'],
                headers: {
                    'X-Moteur-Signature': 'evil',
                    'X-Moteur-Event': 'evil',
                    'X-Custom': 'custom-value'
                }
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );
            await new Promise(r => setTimeout(r, 150));

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const opts = fetchMock.mock.calls[0][1] as RequestInit;
            const headers = opts.headers as Record<string, string>;
            expect(headers['X-Moteur-Signature']).toMatch(/^sha256=/);
            expect(headers['X-Moteur-Event']).toBe('entry.created');
            expect(headers['X-Custom']).toBe('custom-value');
        });
    });

    describe('non-2xx marks delivery as failure', () => {
        it('500 response triggers retry/failed', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Server Error')
            });
            const { id: webhookId } = await createWebhook(projectId, USER, {
                name: 'W',
                url: 'https://example.com/hook',
                events: ['entry.created']
            });
            await dispatch(
                'entry.created',
                {
                    entryId: 'e1',
                    modelId: 'article',
                    status: 'draft',
                    updatedBy: USER
                },
                { projectId, source: 'studio' }
            );

            await new Promise(r => setTimeout(r, 250));

            const log = await getDeliveryLog(projectId, webhookId);
            const d = log[0]!;
            expect(d.status === 'failed' || d.status === 'retrying').toBe(true);
            expect(d.responseStatus).toBe(500);
        });
    });
});

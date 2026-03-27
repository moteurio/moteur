import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/webhooks/webhookService.js', () => ({
    listWebhooks: vi.fn(),
    getWebhook: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    deleteWebhook: vi.fn(),
    rotateSecret: vi.fn(),
    sendTestPing: vi.fn(),
    getDeliveryLog: vi.fn(),
    retryDelivery: vi.fn()
}));

import webhooksRouter from '../../src/studio/webhooks/index.js';
import {
    listWebhooks,
    getWebhook,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    rotateSecret,
    sendTestPing,
    getDeliveryLog,
    retryDelivery
} from '@moteurio/core/webhooks/webhookService.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/webhooks', webhooksRouter);

const base = '/projects/demo/webhooks';

describe('Project webhooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET / returns list of webhooks', async () => {
        const mockList = [
            {
                id: 'wh1',
                projectId: 'demo',
                name: 'My Hook',
                url: 'https://example.com/hook',
                secret: '***',
                events: ['entry.published'],
                filters: [],
                headers: {},
                enabled: true,
                createdAt: '',
                updatedAt: '',
                createdBy: 'user1'
            }
        ];
        (listWebhooks as any).mockResolvedValue(mockList);

        const res = await request(app).get(base);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockList);
        expect(listWebhooks).toHaveBeenCalledWith('demo');
    });

    it('GET /:webhookId returns webhook', async () => {
        const mockWebhook = {
            id: 'wh1',
            projectId: 'demo',
            name: 'My Hook',
            url: 'https://example.com/hook',
            secret: '***',
            events: [],
            filters: [],
            headers: {},
            enabled: true,
            createdAt: '',
            updatedAt: '',
            createdBy: 'user1'
        };
        (getWebhook as any).mockResolvedValue(mockWebhook);

        const res = await request(app).get(`${base}/wh1`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockWebhook);
        expect(getWebhook).toHaveBeenCalledWith('demo', 'wh1');
    });

    it('GET /:webhookId returns 404 when not found', async () => {
        (getWebhook as any).mockRejectedValue(new Error('Webhook "x" not found'));

        const res = await request(app).get(`${base}/x`);

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    it('POST / creates webhook and returns 201', async () => {
        const body = {
            name: 'New Hook',
            url: 'https://example.com/hook',
            events: ['entry.created']
        };
        const created = {
            ...body,
            id: 'wh-new',
            projectId: 'demo',
            secret: 'plaintext-once',
            filters: [],
            headers: {},
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'user1'
        };
        (createWebhook as any).mockResolvedValue(created);

        const res = await request(app).post(base).send(body);

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ name: 'New Hook', url: 'https://example.com/hook' });
        expect(createWebhook).toHaveBeenCalledWith(
            'demo',
            'user1',
            expect.objectContaining({ name: 'New Hook', url: 'https://example.com/hook' })
        );
    });

    it('POST / returns 422 on validation error', async () => {
        (createWebhook as any).mockRejectedValue(new Error('URL is required'));

        const res = await request(app).post(base).send({ name: 'No URL' });

        expect(res.status).toBe(422);
    });

    it('PATCH /:webhookId updates webhook', async () => {
        const updated = {
            id: 'wh1',
            projectId: 'demo',
            name: 'Updated',
            url: 'https://example.com/hook',
            secret: '***',
            events: [],
            filters: [],
            headers: {},
            enabled: false,
            createdAt: '',
            updatedAt: new Date().toISOString(),
            createdBy: 'user1'
        };
        (updateWebhook as any).mockResolvedValue(updated);

        const res = await request(app)
            .patch(`${base}/wh1`)
            .send({ name: 'Updated', enabled: false });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Updated');
        expect(updateWebhook).toHaveBeenCalledWith('demo', 'user1', 'wh1', {
            name: 'Updated',
            enabled: false
        });
    });

    it('PATCH /:webhookId returns 404 when not found', async () => {
        (updateWebhook as any).mockRejectedValue(new Error('Webhook "x" not found'));

        const res = await request(app).patch(`${base}/x`).send({ name: 'X' });

        expect(res.status).toBe(404);
    });

    it('DELETE /:webhookId returns 204', async () => {
        (deleteWebhook as any).mockResolvedValue(undefined);

        const res = await request(app).delete(`${base}/wh1`);

        expect(res.status).toBe(204);
        expect(deleteWebhook).toHaveBeenCalledWith('demo', 'user1', 'wh1');
    });

    it('POST /:webhookId/rotate-secret returns new secret', async () => {
        (rotateSecret as any).mockResolvedValue({ secret: 'new-secret-hex' });

        const res = await request(app).post(`${base}/wh1/rotate-secret`);

        expect(res.status).toBe(200);
        expect(res.body.secret).toBe('new-secret-hex');
        expect(rotateSecret).toHaveBeenCalledWith('demo', 'user1', 'wh1');
    });

    it('POST /:webhookId/test returns delivery', async () => {
        const mockDelivery = {
            id: 'del1',
            webhookId: 'wh1',
            projectId: 'demo',
            event: 'entry.published',
            payload: { test: true, data: { entryId: '_test_' } },
            status: 'success',
            attemptCount: 1,
            createdAt: new Date().toISOString()
        };
        (sendTestPing as any).mockResolvedValue(mockDelivery);

        const res = await request(app).post(`${base}/wh1/test`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(sendTestPing).toHaveBeenCalledWith('demo', 'wh1');
    });

    it('GET /:webhookId/log returns delivery log', async () => {
        const mockLog = [
            {
                id: 'del1',
                webhookId: 'wh1',
                projectId: 'demo',
                event: 'entry.published',
                status: 'success',
                attemptCount: 1,
                createdAt: new Date().toISOString()
            }
        ];
        (getDeliveryLog as any).mockResolvedValue(mockLog);

        const res = await request(app).get(`${base}/wh1/log`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockLog);
        expect(getDeliveryLog).toHaveBeenCalledWith('demo', 'wh1', { limit: 50, offset: 0 });
    });

    it('GET /:webhookId/log accepts limit and offset', async () => {
        (getDeliveryLog as any).mockResolvedValue([]);

        await request(app).get(`${base}/wh1/log?limit=10&offset=5`);

        expect(getDeliveryLog).toHaveBeenCalledWith('demo', 'wh1', { limit: 10, offset: 5 });
    });

    it('POST /:webhookId/log/:deliveryId/retry returns 204', async () => {
        (retryDelivery as any).mockResolvedValue(undefined);

        const res = await request(app).post(`${base}/wh1/log/del1/retry`);

        expect(res.status).toBe(204);
        expect(retryDelivery).toHaveBeenCalledWith('demo', 'wh1', 'del1');
    });

    it('POST /:webhookId/log/:deliveryId/retry returns 422 when only failed can be retried', async () => {
        (retryDelivery as any).mockRejectedValue(
            new Error('Only failed deliveries can be retried')
        );

        const res = await request(app).post(`${base}/wh1/log/del1/retry`);

        expect(res.status).toBe(422);
        expect(res.body.error).toContain('Only failed');
    });
});

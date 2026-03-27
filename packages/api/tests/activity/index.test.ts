import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

vi.mock('@moteurio/core/activityLogger', () => ({
    getGlobalLog: vi.fn()
}));

import activityGlobalRouter from '../../src/activity/index.js';
import { getGlobalLog } from '@moteurio/core/activityLogger.js';

const app = express();
app.use(express.json());
app.use('/activity', activityGlobalRouter);

describe('GET /activity (global)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns global activity with default limit', async () => {
        const mockEvents = [
            {
                id: 'ev-1',
                projectId: '_system',
                resourceType: 'blueprint',
                resourceId: 'blog',
                action: 'created',
                userid: 'op1',
                userName: 'Operator',
                timestamp: '2025-01-01T12:00:00.000Z'
            }
        ];
        (getGlobalLog as any).mockResolvedValue({ events: mockEvents });

        const res = await request(app).get('/activity');

        expect(res.status).toBe(200);
        expect(res.body.events).toEqual(mockEvents);
        expect(getGlobalLog).toHaveBeenCalledWith(50, undefined);
    });

    it('accepts limit query and caps at 200', async () => {
        (getGlobalLog as any).mockResolvedValue({ events: [] });

        await request(app).get('/activity?limit=300');

        expect(getGlobalLog).toHaveBeenCalledWith(200, undefined);
    });

    it('passes before query for pagination', async () => {
        (getGlobalLog as any).mockResolvedValue({ events: [], nextBefore: undefined });

        await request(app).get('/activity?before=2025-01-01T10:00:00.000Z');

        expect(getGlobalLog).toHaveBeenCalledWith(50, '2025-01-01T10:00:00.000Z');
    });

    it('returns 500 on getGlobalLog failure', async () => {
        (getGlobalLog as any).mockRejectedValue(new Error('read error'));

        const res = await request(app).get('/activity');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('read error');
    });
});

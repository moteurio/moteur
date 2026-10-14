import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/schedules.js', () => ({
    listSchedules: vi.fn(),
    getSchedule: vi.fn(),
    createSchedule: vi.fn(),
    cancelSchedule: vi.fn(),
    deleteSchedule: vi.fn()
}));

import schedulesRouter, { openapi } from '../../src/studio/schedules/index.js';
import {
    listSchedules,
    getSchedule,
    createSchedule,
    cancelSchedule,
    deleteSchedule
} from '@moteurio/core/schedules.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/schedules', schedulesRouter);

const base = '/projects/demo/schedules';
const user = { id: 'user1', roles: ['editor'] };

const schedule = {
    id: 'sch1',
    projectId: 'demo',
    resourceType: 'entry',
    resourceId: 'e1',
    modelId: 'article',
    action: 'publish',
    scheduledAt: '2030-01-01T00:00:00.000Z',
    scheduledBy: 'user1',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
};

function withStatus(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode });
}

describe('Project schedules', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /', () => {
        it('returns the list of schedules', async () => {
            vi.mocked(listSchedules).mockResolvedValue([schedule] as any);

            const res = await request(app).get(base);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([schedule]);
            expect(listSchedules).toHaveBeenCalledWith(user, 'demo', {});
        });

        it('passes valid filters through', async () => {
            vi.mocked(listSchedules).mockResolvedValue([]);

            await request(app).get(base).query({
                resourceType: 'entry',
                resourceId: ' e1 ',
                action: 'unpublish',
                status: 'pending'
            });

            expect(listSchedules).toHaveBeenCalledWith(user, 'demo', {
                resourceType: 'entry',
                resourceId: 'e1',
                action: 'unpublish',
                status: 'pending'
            });
        });

        it('accepts comma-separated statuses', async () => {
            vi.mocked(listSchedules).mockResolvedValue([]);

            await request(app).get(`${base}?status=pending, failed`);

            expect(listSchedules).toHaveBeenCalledWith(user, 'demo', {
                status: ['pending', 'failed']
            });
        });

        it('accepts repeated status params', async () => {
            vi.mocked(listSchedules).mockResolvedValue([]);

            await request(app).get(`${base}?status=done&status=cancelled,failed`);

            expect(listSchedules).toHaveBeenCalledWith(user, 'demo', {
                status: ['done', 'cancelled', 'failed']
            });
        });

        it('ignores unknown filter values', async () => {
            vi.mocked(listSchedules).mockResolvedValue([]);

            await request(app).get(base).query({
                resourceType: 'post',
                action: 'archive',
                status: 'bogus,pending',
                resourceId: '   '
            });

            expect(listSchedules).toHaveBeenCalledWith(user, 'demo', { status: 'pending' });
        });

        it('maps access errors to 403', async () => {
            vi.mocked(listSchedules).mockRejectedValue(
                new Error('User "user1" does not have access to this project.')
            );

            const res = await request(app).get(base);

            expect(res.status).toBe(403);
        });
    });

    describe('GET /:scheduleId', () => {
        it('returns the schedule', async () => {
            vi.mocked(getSchedule).mockResolvedValue(schedule as any);

            const res = await request(app).get(`${base}/sch1`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(schedule);
            expect(getSchedule).toHaveBeenCalledWith(user, 'demo', 'sch1');
        });

        it('returns 404 when not found', async () => {
            vi.mocked(getSchedule).mockRejectedValue(
                new Error('Schedule "x" not found in project "demo".')
            );

            const res = await request(app).get(`${base}/x`);

            expect(res.status).toBe(404);
            expect(res.body.error).toContain('not found');
        });
    });

    describe('POST /', () => {
        const body = {
            resourceType: 'entry',
            resourceId: 'e1',
            modelId: 'article',
            action: 'publish',
            scheduledAt: '2030-01-01T00:00:00.000Z'
        };

        it('creates a schedule and returns 201', async () => {
            vi.mocked(createSchedule).mockResolvedValue(schedule as any);

            const res = await request(app).post(base).send(body);

            expect(res.status).toBe(201);
            expect(res.body).toEqual(schedule);
            expect(createSchedule).toHaveBeenCalledWith(user, 'demo', body);
        });

        it('passes an empty object when there is no body', async () => {
            vi.mocked(createSchedule).mockRejectedValue(
                withStatus('resourceType and resourceId are required.', 400)
            );

            const res = await request(app).post(base);

            expect(res.status).toBe(400);
            expect(createSchedule).toHaveBeenCalledWith(user, 'demo', {});
        });

        it('returns 400 for validation errors', async () => {
            vi.mocked(createSchedule).mockRejectedValue(
                withStatus('scheduledAt must be in the future.', 400)
            );

            const res = await request(app).post(base).send(body);

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('in the future');
        });

        it('returns 403 when the review workflow forbids scheduling', async () => {
            vi.mocked(createSchedule).mockRejectedValue(
                withStatus(
                    'Only users with reviewer or admin role can schedule when review workflow is enabled.',
                    403
                )
            );

            const res = await request(app).post(base).send(body);

            expect(res.status).toBe(403);
        });

        it('returns 403 when the entry has no approved review', async () => {
            vi.mocked(createSchedule).mockRejectedValue(
                new Error(
                    'Entry must have an approved review before it can be scheduled for publish.'
                )
            );

            const res = await request(app).post(base).send(body);

            expect(res.status).toBe(403);
        });

        it('returns 409 when a pending schedule already exists', async () => {
            vi.mocked(createSchedule).mockRejectedValue(
                new Error(
                    'A pending schedule already exists for this resource and action. Cancel it before creating a new one.'
                )
            );

            const res = await request(app).post(base).send(body);

            expect(res.status).toBe(409);
        });
    });

    describe('POST /:scheduleId/cancel', () => {
        it('cancels the schedule', async () => {
            const cancelled = { ...schedule, status: 'cancelled' };
            vi.mocked(cancelSchedule).mockResolvedValue(cancelled as any);

            const res = await request(app).post(`${base}/sch1/cancel`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(cancelled);
            expect(cancelSchedule).toHaveBeenCalledWith(user, 'demo', 'sch1');
        });

        it('returns 400 when the schedule is not pending', async () => {
            vi.mocked(cancelSchedule).mockRejectedValue(
                withStatus('Only pending schedules can be cancelled.', 400)
            );

            const res = await request(app).post(`${base}/sch1/cancel`);

            expect(res.status).toBe(400);
        });

        it('returns 404 when not found', async () => {
            vi.mocked(cancelSchedule).mockRejectedValue(
                new Error('Schedule "x" not found in project "demo".')
            );

            const res = await request(app).post(`${base}/x/cancel`);

            expect(res.status).toBe(404);
        });
    });

    describe('DELETE /:scheduleId', () => {
        it('deletes the schedule and returns 204', async () => {
            vi.mocked(deleteSchedule).mockResolvedValue(undefined);

            const res = await request(app).delete(`${base}/sch1`);

            expect(res.status).toBe(204);
            expect(res.body).toEqual({});
            expect(deleteSchedule).toHaveBeenCalledWith(user, 'demo', 'sch1');
        });

        it('returns 400 when the schedule is still pending', async () => {
            vi.mocked(deleteSchedule).mockRejectedValue(
                withStatus('Cancel the schedule before deleting it.', 400)
            );

            const res = await request(app).delete(`${base}/sch1`);

            expect(res.status).toBe(400);
        });

        it('returns 404 when not found', async () => {
            vi.mocked(deleteSchedule).mockRejectedValue(
                new Error('Schedule "x" not found in project "demo".')
            );

            const res = await request(app).delete(`${base}/x`);

            expect(res.status).toBe(404);
        });
    });

    it('documents every route in the OpenAPI spec', () => {
        expect(Object.keys(openapi).sort()).toEqual([
            '/projects/{projectId}/schedules',
            '/projects/{projectId}/schedules/{scheduleId}',
            '/projects/{projectId}/schedules/{scheduleId}/cancel'
        ]);
        expect(openapi['/projects/{projectId}/schedules']).toHaveProperty('get');
        expect(openapi['/projects/{projectId}/schedules']).toHaveProperty('post');
        expect(openapi['/projects/{projectId}/schedules/{scheduleId}']).toHaveProperty('get');
        expect(openapi['/projects/{projectId}/schedules/{scheduleId}']).toHaveProperty('delete');
        expect(openapi['/projects/{projectId}/schedules/{scheduleId}/cancel']).toHaveProperty(
            'post'
        );
    });
});

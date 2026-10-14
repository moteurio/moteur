import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MoteurClient } from '../src/client.js';
import { projectSchedulesApi } from '../src/project/schedules.js';
import { createProjectClient } from '../src/admin/forProject.js';

const schedule = {
    id: 'sch 1',
    projectId: 'my proj',
    resourceType: 'page',
    resourceId: 'p1',
    action: 'publish',
    scheduledAt: '2030-01-01T00:00:00.000Z',
    scheduledBy: 'u1',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
} as const;

function fakeClient() {
    return {
        get: vi.fn().mockResolvedValue([]),
        post: vi.fn().mockResolvedValue(schedule),
        patch: vi.fn(),
        put: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined)
    };
}

describe('projectSchedulesApi', () => {
    let client: ReturnType<typeof fakeClient>;
    let api: ReturnType<typeof projectSchedulesApi>;

    beforeEach(() => {
        client = fakeClient();
        api = projectSchedulesApi(client as unknown as MoteurClient);
    });

    it('list calls GET with no params and wraps an array response', async () => {
        client.get.mockResolvedValue([schedule]);

        const result = await api.list('my proj');

        expect(client.get).toHaveBeenCalledWith('/projects/my%20proj/schedules', undefined);
        expect(result).toEqual({ schedules: [schedule] });
    });

    it('list also accepts a { schedules } response', async () => {
        client.get.mockResolvedValue({ schedules: [schedule] });
        expect(await api.list('p')).toEqual({ schedules: [schedule] });

        client.get.mockResolvedValue({});
        expect(await api.list('p')).toEqual({ schedules: [] });
    });

    it('list sends filters as query params and joins status arrays', async () => {
        await api.list('p', {
            resourceType: 'entry',
            resourceId: 'e1',
            action: 'unpublish',
            status: ['pending', 'failed']
        });

        expect(client.get).toHaveBeenCalledWith('/projects/p/schedules', {
            resourceType: 'entry',
            resourceId: 'e1',
            action: 'unpublish',
            status: 'pending,failed'
        });
    });

    it('list passes a single status as-is', async () => {
        await api.list('p', { status: 'done' });

        expect(client.get).toHaveBeenCalledWith(
            '/projects/p/schedules',
            expect.objectContaining({ status: 'done' })
        );
    });

    it('get calls GET /projects/:id/schedules/:scheduleId with encoded ids', async () => {
        client.get.mockResolvedValue(schedule);

        expect(await api.get('my proj', 'sch 1')).toEqual(schedule);
        expect(client.get).toHaveBeenCalledWith('/projects/my%20proj/schedules/sch%201');
    });

    it('create calls POST with the body', async () => {
        const body = {
            resourceType: 'page' as const,
            resourceId: 'p1',
            action: 'publish' as const,
            scheduledAt: '2030-01-01T00:00:00.000Z'
        };

        expect(await api.create('p', body)).toEqual(schedule);
        expect(client.post).toHaveBeenCalledWith('/projects/p/schedules', body);
    });

    it('cancel calls POST /:scheduleId/cancel', async () => {
        await api.cancel('p', 'sch 1');

        expect(client.post).toHaveBeenCalledWith('/projects/p/schedules/sch%201/cancel');
    });

    it('delete calls DELETE /:scheduleId', async () => {
        await api.delete('p', 'sch 1');

        expect(client.delete).toHaveBeenCalledWith('/projects/p/schedules/sch%201');
    });
});

describe('createProjectClient schedules', () => {
    it('binds the project id to every schedules method', async () => {
        const client = fakeClient();
        const project = createProjectClient(client as unknown as MoteurClient, 'proj');
        const body = {
            resourceType: 'page' as const,
            resourceId: 'p1',
            action: 'publish' as const,
            scheduledAt: '2030-01-01T00:00:00.000Z'
        };

        await project.schedules.list({ status: 'pending' });
        await project.schedules.get('s1');
        await project.schedules.create(body);
        await project.schedules.cancel('s1');
        await project.schedules.delete('s1');

        expect(client.get).toHaveBeenNthCalledWith(
            1,
            '/projects/proj/schedules',
            expect.objectContaining({ status: 'pending' })
        );
        expect(client.get).toHaveBeenNthCalledWith(2, '/projects/proj/schedules/s1');
        expect(client.post).toHaveBeenNthCalledWith(1, '/projects/proj/schedules', body);
        expect(client.post).toHaveBeenNthCalledWith(2, '/projects/proj/schedules/s1/cancel');
        expect(client.delete).toHaveBeenCalledWith('/projects/proj/schedules/s1');
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { User } from '@moteurio/types/User.js';
import type { Schedule } from '@moteurio/types/Schedule.js';

vi.mock('../src/schedulerEngine.js', () => ({
    register: vi.fn(),
    cancel: vi.fn()
}));
vi.mock('../src/webhooks/webhookService.js', () => ({
    dispatch: vi.fn()
}));
vi.mock('../src/reviews.js', () => ({
    hasApprovedReview: vi.fn(),
    hasApprovedReviewForPage: vi.fn()
}));

import {
    listSchedules,
    getSchedule,
    getSchedulesForResource,
    createSchedule,
    cancelSchedule,
    deleteSchedule
} from '../src/schedules.js';
import * as schedulerEngine from '../src/schedulerEngine.js';
import { dispatch as webhookDispatch } from '../src/webhooks/webhookService.js';
import { hasApprovedReview, hasApprovedReviewForPage } from '../src/reviews.js';
import { putProjectJson } from '../src/utils/projectStorage.js';
import { scheduleKey } from '../src/utils/storageKeys.js';
import { trashScheduleDir } from '../src/utils/pathUtils.js';

const projectId = 'schedules-test-proj';
const editor: User = {
    id: 'u1',
    name: 'Editor',
    isActive: true,
    email: 'e@test.com',
    roles: [],
    projects: []
};
const reviewer: User = { ...editor, id: 'u2', name: 'Reviewer', roles: ['reviewer'] };
const outsider: User = { ...editor, id: 'u3', name: 'Outsider' };

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

function statusCodeOf(err: unknown): number | undefined {
    return (err as { statusCode?: number }).statusCode;
}

describe('schedules', () => {
    let tempDir: string;
    let projectDir: string;
    let originalDataRoot: string | undefined;

    async function writeProject(extra: Record<string, unknown> = {}) {
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Test',
                defaultLocale: 'en',
                users: ['u1', 'u2'],
                ...extra
            }),
            'utf-8'
        );
    }

    async function storeSchedule(overrides: Partial<Schedule>): Promise<Schedule> {
        const now = new Date().toISOString();
        const schedule: Schedule = {
            id: 'stored',
            projectId,
            resourceType: 'page',
            resourceId: 'p1',
            action: 'publish',
            scheduledAt: inOneHour(),
            scheduledBy: 'u1',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            ...overrides
        };
        await putProjectJson(projectId, scheduleKey(schedule.id), schedule);
        return schedule;
    }

    beforeEach(async () => {
        vi.clearAllMocks();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-schedules-'));
        projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await writeProject();
        originalDataRoot = process.env.DATA_ROOT;
        process.env.DATA_ROOT = tempDir;
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('createSchedule', () => {
        it('creates a pending entry schedule, registers it and dispatches entry.scheduled', async () => {
            const scheduledAt = inOneHour();
            const schedule = await createSchedule(editor, projectId, {
                resourceType: 'entry',
                resourceId: 'e1',
                modelId: 'article',
                action: 'publish',
                scheduledAt
            });

            expect(schedule).toMatchObject({
                projectId,
                resourceType: 'entry',
                resourceId: 'e1',
                modelId: 'article',
                action: 'publish',
                scheduledAt,
                scheduledBy: 'u1',
                status: 'pending'
            });
            expect(schedule.id).toBeTruthy();
            expect(await getSchedule(editor, projectId, schedule.id)).toEqual(schedule);
            expect(schedulerEngine.register).toHaveBeenCalledWith(schedule);
            expect(webhookDispatch).toHaveBeenCalledWith(
                'entry.scheduled',
                expect.objectContaining({
                    scheduleId: schedule.id,
                    entryId: 'e1',
                    modelId: 'article'
                }),
                { projectId, source: 'api' }
            );
        });

        it('dispatches page.scheduled for page schedules', async () => {
            const schedule = await createSchedule(editor, projectId, {
                resourceType: 'page',
                resourceId: 'p1',
                action: 'unpublish',
                scheduledAt: inOneHour()
            });

            expect(webhookDispatch).toHaveBeenCalledWith(
                'page.scheduled',
                expect.objectContaining({ scheduleId: schedule.id, pageId: 'p1' }),
                { projectId, source: 'api' }
            );
        });

        it('normalizes scheduledAt to ISO 8601', async () => {
            const date = new Date(Date.now() + 60 * 60 * 1000);
            date.setMilliseconds(0);
            const schedule = await createSchedule(editor, projectId, {
                resourceType: 'page',
                resourceId: 'p1',
                action: 'publish',
                scheduledAt: date.toUTCString()
            });
            expect(schedule.scheduledAt).toBe(date.toISOString());
        });

        it.each([
            [{ resourceId: 'p1' }, 'resourceType and resourceId are required'],
            [{ resourceType: 'page' }, 'resourceType and resourceId are required'],
            [{ resourceType: 'post', resourceId: 'p1' }, 'resourceType must be'],
            [{ resourceType: 'page', resourceId: 'p1', action: 'archive' }, 'action must be'],
            [{ resourceType: 'entry', resourceId: 'e1' }, 'modelId is required'],
            [
                { resourceType: 'page', resourceId: 'p1', scheduledAt: 'not-a-date' },
                'Invalid scheduledAt'
            ],
            [
                {
                    resourceType: 'page',
                    resourceId: 'p1',
                    scheduledAt: new Date(Date.now() - 1000).toISOString()
                },
                'must be in the future'
            ]
        ])('rejects invalid input %j with a 400 error', async (partial, message) => {
            const input = { action: 'publish', scheduledAt: inOneHour(), ...partial };
            const err = await createSchedule(editor, projectId, input as never).catch(e => e);

            expect(err).toBeInstanceOf(Error);
            expect(err.message).toContain(message);
            expect(statusCodeOf(err)).toBe(400);
            expect(schedulerEngine.register).not.toHaveBeenCalled();
        });

        it('rejects a second pending schedule for the same resource and action', async () => {
            const input = {
                resourceType: 'page' as const,
                resourceId: 'p1',
                action: 'publish' as const,
                scheduledAt: inOneHour()
            };
            await createSchedule(editor, projectId, input);

            await expect(createSchedule(editor, projectId, input)).rejects.toThrow(
                /already exists/
            );
        });

        it('allows a pending schedule for a different action on the same resource', async () => {
            await createSchedule(editor, projectId, {
                resourceType: 'page',
                resourceId: 'p1',
                action: 'publish',
                scheduledAt: inOneHour()
            });
            await expect(
                createSchedule(editor, projectId, {
                    resourceType: 'page',
                    resourceId: 'p1',
                    action: 'unpublish',
                    scheduledAt: inTwoHours()
                })
            ).resolves.toMatchObject({ action: 'unpublish', status: 'pending' });
        });

        it('rejects users who are not members of the project', async () => {
            await expect(
                createSchedule(outsider, projectId, {
                    resourceType: 'page',
                    resourceId: 'p1',
                    action: 'publish',
                    scheduledAt: inOneHour()
                })
            ).rejects.toThrow();
        });

        describe('with review workflow required', () => {
            beforeEach(async () => {
                await writeProject({ workflow: { enabled: true, requireReview: true } });
            });

            it('forbids non-reviewers with a 403 error', async () => {
                const err = await createSchedule(editor, projectId, {
                    resourceType: 'page',
                    resourceId: 'p1',
                    action: 'unpublish',
                    scheduledAt: inOneHour()
                }).catch(e => e);

                expect(statusCodeOf(err)).toBe(403);
            });

            it('requires an approved review before scheduling an entry publish', async () => {
                vi.mocked(hasApprovedReview).mockResolvedValue(false);

                await expect(
                    createSchedule(reviewer, projectId, {
                        resourceType: 'entry',
                        resourceId: 'e1',
                        modelId: 'article',
                        action: 'publish',
                        scheduledAt: inOneHour()
                    })
                ).rejects.toThrow(/approved review/);
                expect(hasApprovedReview).toHaveBeenCalledWith(projectId, 'article', 'e1');
            });

            it('requires an approved review before scheduling a page publish', async () => {
                vi.mocked(hasApprovedReviewForPage).mockResolvedValue(false);

                await expect(
                    createSchedule(reviewer, projectId, {
                        resourceType: 'page',
                        resourceId: 'p1',
                        action: 'publish',
                        scheduledAt: inOneHour()
                    })
                ).rejects.toThrow(/approved review/);
            });

            it('lets a reviewer schedule an approved publish', async () => {
                vi.mocked(hasApprovedReviewForPage).mockResolvedValue(true);

                await expect(
                    createSchedule(reviewer, projectId, {
                        resourceType: 'page',
                        resourceId: 'p1',
                        action: 'publish',
                        scheduledAt: inOneHour()
                    })
                ).resolves.toMatchObject({ status: 'pending', scheduledBy: 'u2' });
            });

            it('does not require a review to schedule an unpublish', async () => {
                await expect(
                    createSchedule(reviewer, projectId, {
                        resourceType: 'page',
                        resourceId: 'p1',
                        action: 'unpublish',
                        scheduledAt: inOneHour()
                    })
                ).resolves.toMatchObject({ action: 'unpublish' });
                expect(hasApprovedReviewForPage).not.toHaveBeenCalled();
            });
        });
    });

    describe('listSchedules', () => {
        beforeEach(async () => {
            await storeSchedule({
                id: 's-late',
                resourceType: 'entry',
                resourceId: 'e1',
                modelId: 'article',
                scheduledAt: '2030-03-01T00:00:00.000Z'
            });
            await storeSchedule({
                id: 's-early',
                resourceId: 'p1',
                action: 'unpublish',
                status: 'done',
                scheduledAt: '2030-01-01T00:00:00.000Z'
            });
            await storeSchedule({
                id: 's-mid',
                resourceId: 'p2',
                status: 'cancelled',
                scheduledAt: '2030-02-01T00:00:00.000Z'
            });
        });

        it('returns all schedules sorted by scheduledAt ascending', async () => {
            const list = await listSchedules(editor, projectId);
            expect(list.map(s => s.id)).toEqual(['s-early', 's-mid', 's-late']);
        });

        it('returns an empty list when the project has no schedules', async () => {
            const emptyId = 'schedules-empty-proj';
            const emptyDir = path.join(tempDir, 'data', 'projects', emptyId);
            await fs.mkdir(emptyDir, { recursive: true });
            await fs.writeFile(
                path.join(emptyDir, 'project.json'),
                JSON.stringify({ id: emptyId, label: 'Empty', defaultLocale: 'en', users: ['u1'] }),
                'utf-8'
            );
            expect(await listSchedules(editor, emptyId)).toEqual([]);
        });

        it('filters by resourceType, resourceId and action', async () => {
            expect(
                (await listSchedules(editor, projectId, { resourceType: 'entry' })).map(s => s.id)
            ).toEqual(['s-late']);
            expect(
                (await listSchedules(editor, projectId, { resourceId: 'p2' })).map(s => s.id)
            ).toEqual(['s-mid']);
            expect(
                (await listSchedules(editor, projectId, { action: 'unpublish' })).map(s => s.id)
            ).toEqual(['s-early']);
        });

        it('filters by a single status or a list of statuses', async () => {
            expect(
                (await listSchedules(editor, projectId, { status: 'pending' })).map(s => s.id)
            ).toEqual(['s-late']);
            expect(
                (await listSchedules(editor, projectId, { status: ['done', 'cancelled'] })).map(
                    s => s.id
                )
            ).toEqual(['s-early', 's-mid']);
        });

        it('rejects users who are not members of the project', async () => {
            await expect(listSchedules(outsider, projectId)).rejects.toThrow();
        });
    });

    describe('getSchedule', () => {
        it('throws a not found error for unknown ids', async () => {
            await expect(getSchedule(editor, projectId, 'missing')).rejects.toThrow(/not found/);
        });
    });

    describe('getSchedulesForResource', () => {
        it('returns only active (pending/processing/failed) schedules for the resource', async () => {
            await storeSchedule({ id: 'a', status: 'pending' });
            await storeSchedule({ id: 'b', status: 'processing' });
            await storeSchedule({ id: 'c', status: 'failed' });
            await storeSchedule({ id: 'd', status: 'done' });
            await storeSchedule({ id: 'e', status: 'cancelled' });
            await storeSchedule({ id: 'f', status: 'pending', resourceId: 'other' });

            const ids = (await getSchedulesForResource(projectId, 'page', 'p1'))
                .map(s => s.id)
                .sort();
            expect(ids).toEqual(['a', 'b', 'c']);
        });
    });

    describe('cancelSchedule', () => {
        it('cancels a pending schedule, unregisters it and dispatches unscheduled', async () => {
            const created = await createSchedule(editor, projectId, {
                resourceType: 'entry',
                resourceId: 'e1',
                modelId: 'article',
                action: 'publish',
                scheduledAt: inOneHour()
            });

            const cancelled = await cancelSchedule(editor, projectId, created.id);

            expect(cancelled.status).toBe('cancelled');
            expect((await getSchedule(editor, projectId, created.id)).status).toBe('cancelled');
            expect(schedulerEngine.cancel).toHaveBeenCalledWith(created.id);
            expect(webhookDispatch).toHaveBeenCalledWith(
                'entry.unscheduled',
                expect.objectContaining({ scheduleId: created.id, entryId: 'e1' }),
                { projectId, source: 'api' }
            );
        });

        it('allows a new schedule for the same resource and action after cancelling', async () => {
            const input = {
                resourceType: 'page' as const,
                resourceId: 'p1',
                action: 'publish' as const,
                scheduledAt: inOneHour()
            };
            const first = await createSchedule(editor, projectId, input);
            await cancelSchedule(editor, projectId, first.id);

            await expect(createSchedule(editor, projectId, input)).resolves.toMatchObject({
                status: 'pending'
            });
        });

        it.each(['processing', 'done', 'failed', 'cancelled'] as const)(
            'rejects cancelling a %s schedule with a 400 error',
            async status => {
                await storeSchedule({ id: 'x', status });
                const err = await cancelSchedule(editor, projectId, 'x').catch(e => e);

                expect(err.message).toContain('Only pending schedules');
                expect(statusCodeOf(err)).toBe(400);
            }
        );

        it('throws a not found error for unknown ids', async () => {
            await expect(cancelSchedule(editor, projectId, 'missing')).rejects.toThrow(/not found/);
        });
    });

    describe('deleteSchedule', () => {
        it.each(['done', 'failed', 'cancelled'] as const)(
            'deletes a %s schedule and moves it to the trash',
            async status => {
                await storeSchedule({ id: 'x', status });

                await deleteSchedule(editor, projectId, 'x');

                await expect(getSchedule(editor, projectId, 'x')).rejects.toThrow(/not found/);
                const trashDir = trashScheduleDir(projectId, 'x');
                const trashed = await fs.readdir(trashDir);
                expect(trashed).toHaveLength(1);
                const content = JSON.parse(
                    await fs.readFile(path.join(trashDir, trashed[0]), 'utf-8')
                );
                expect(content).toMatchObject({ id: 'x', status });
            }
        );

        it.each(['pending', 'processing'] as const)(
            'rejects deleting a %s schedule with a 400 error',
            async status => {
                await storeSchedule({ id: 'x', status });
                const err = await deleteSchedule(editor, projectId, 'x').catch(e => e);

                expect(err.message).toContain('Cancel the schedule');
                expect(statusCodeOf(err)).toBe(400);
                expect((await getSchedule(editor, projectId, 'x')).status).toBe(status);
            }
        );

        it('throws a not found error for unknown ids', async () => {
            await expect(deleteSchedule(editor, projectId, 'missing')).rejects.toThrow(/not found/);
        });
    });
});

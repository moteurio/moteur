import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '@moteurio/types/Schedule.js';
const state = vi.hoisted(() => ({ schedule: null as Schedule | null, update: vi.fn() }));
vi.mock('../src/projects.js', () => ({ loadProjects: () => [{ id: 'p1' }] }));
vi.mock('../src/entries.js', () => ({ updateEntry: state.update }));
vi.mock('../src/pages.js', () => ({ updatePage: vi.fn() }));
vi.mock('../src/utils/projectStorage.js', () => ({
    getProjectJson: async () => state.schedule && globalThis.structuredClone(state.schedule),
    putProjectJson: async (_p: string, _k: string, schedule: Schedule) => {
        state.schedule = globalThis.structuredClone(schedule);
    },
    listProjectKeys: async () => ['s1.json']
}));
vi.mock('../src/webhooks/webhookService.js', () => ({ dispatch: vi.fn() }));
import { register, sweep, stopSweep } from '../src/schedulerEngine.js';

describe('scheduler recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        state.update.mockReset().mockResolvedValue({});
        state.schedule = {
            id: 's1',
            projectId: 'p1',
            resourceType: 'entry',
            resourceId: 'e1',
            modelId: 'articles',
            action: 'publish',
            scheduledAt: new Date(Date.now() - 1000).toISOString(),
            scheduledBy: 'u1',
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    });
    afterEach(() => {
        stopSweep();
        vi.useRealTimers();
    });
    it('recovers a processing record left behind by a stopped process', async () => {
        state.schedule!.status = 'processing';
        await sweep();
        await vi.advanceTimersByTimeAsync(0);
        expect(state.update).toHaveBeenCalledTimes(1);
        expect(state.schedule?.status).toBe('done');
    });
    it('does not execute twice when an overdue timer and sweep overlap', async () => {
        register(state.schedule!);
        await sweep();
        await vi.advanceTimersByTimeAsync(0);
        expect(state.update).toHaveBeenCalledTimes(1);
        expect(state.schedule?.status).toBe('done');
    });
    it('does not recover a processing job that is still running', async () => {
        let finish!: () => void;
        state.update.mockReturnValue(
            new Promise<void>(resolve => {
                finish = resolve;
            })
        );
        register(state.schedule!);
        await vi.advanceTimersByTimeAsync(0);
        expect(state.schedule?.status).toBe('processing');
        await sweep();
        expect(state.update).toHaveBeenCalledTimes(1);
        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(state.schedule?.status).toBe('done');
    });
});

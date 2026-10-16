import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Schedule } from '@moteurio/types/Schedule.js';

vi.mock('../src/utils/projectStorage.js', () => ({
    getProjectJson: vi.fn().mockResolvedValue(null),
    putProjectJson: vi.fn(),
    listProjectKeys: vi.fn().mockResolvedValue([])
}));

import { getProjectJson } from '../src/utils/projectStorage.js';
import { register, stopSweep } from '../src/schedulerEngine.js';

const DAY = 24 * 60 * 60 * 1000;

function scheduleIn(ms: number): Schedule {
    const now = new Date().toISOString();
    return {
        id: 's1',
        projectId: 'p1',
        resourceType: 'entry',
        resourceId: 'e1',
        modelId: 'article',
        action: 'publish',
        scheduledAt: new Date(Date.now() + ms).toISOString(),
        scheduledBy: 'u1',
        status: 'pending',
        createdAt: now,
        updatedAt: now
    };
}

describe('schedulerEngine.register', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(getProjectJson).mockClear();
    });

    afterEach(() => {
        stopSweep();
        vi.useRealTimers();
    });

    it('runs a schedule when it is due', async () => {
        register(scheduleIn(DAY));
        await vi.advanceTimersByTimeAsync(DAY - 1000);
        expect(getProjectJson).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2000);
        expect(getProjectJson).toHaveBeenCalledTimes(1);
    });

    it('waits for schedules beyond the 24.8-day timer limit instead of running them at once', async () => {
        register(scheduleIn(40 * DAY));
        await vi.advanceTimersByTimeAsync(10);
        expect(getProjectJson).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(30 * DAY);
        expect(getProjectJson).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(10 * DAY);
        expect(getProjectJson).toHaveBeenCalledTimes(1);
    });
});

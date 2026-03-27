import { describe, it, expect, beforeEach } from 'vitest';
import {
    recordStudioRequest,
    recordPublicRequest,
    getUsageCounts,
    resetStudioCount,
    resetPublicCount
} from '../../src/usage/usageStore.js';

describe('usageStore', () => {
    beforeEach(() => {
        resetStudioCount();
        resetPublicCount();
    });

    it('starts with zero studio and no public projects', () => {
        const c = getUsageCounts();
        expect(c.studio.total).toBe(0);
        expect(Object.keys(c.public.byProject)).toHaveLength(0);
    });

    it('increments studio count', () => {
        recordStudioRequest();
        recordStudioRequest();
        const c = getUsageCounts();
        expect(c.studio.total).toBe(2);
    });

    it('increments public count per project', () => {
        recordPublicRequest('proj-a');
        recordPublicRequest('proj-a');
        recordPublicRequest('proj-b');
        const c = getUsageCounts();
        expect(c.public.byProject['proj-a'].total).toBe(2);
        expect(c.public.byProject['proj-b'].total).toBe(1);
    });

    it('returns copies so external mutation does not affect store', () => {
        recordStudioRequest();
        const c = getUsageCounts();
        c.studio.total = 999;
        const c2 = getUsageCounts();
        expect(c2.studio.total).toBe(1);
    });

    it('resetStudioCount zeros studio', () => {
        recordStudioRequest();
        resetStudioCount();
        expect(getUsageCounts().studio.total).toBe(0);
    });

    it('resetPublicCount(projectId) removes one project', () => {
        recordPublicRequest('p1');
        recordPublicRequest('p2');
        resetPublicCount('p1');
        const c = getUsageCounts();
        expect(c.public.byProject['p1']).toBeUndefined();
        expect(c.public.byProject['p2'].total).toBe(1);
    });

    it('resetPublicCount() removes all public', () => {
        recordPublicRequest('p1');
        resetPublicCount();
        expect(Object.keys(getUsageCounts().public.byProject)).toHaveLength(0);
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryMeteringStore, setMeteringStore } from '@moteurio/core/metering.js';
import {
    recordStudioRequest,
    recordPublicRequest,
    getUsageCounts
} from '../../src/usage/usageStore.js';

describe('usageStore', () => {
    beforeEach(() => {
        setMeteringStore(createMemoryMeteringStore());
    });

    it('starts with zero studio and no public projects', () => {
        const c = getUsageCounts();
        expect(c.studio.total).toBe(0);
        expect(Object.keys(c.public.byProject)).toHaveLength(0);
    });

    it('increments studio count', () => {
        recordStudioRequest();
        recordStudioRequest();
        expect(getUsageCounts().studio.total).toBe(2);
    });

    it('increments public count per project', () => {
        recordPublicRequest('proj-a');
        recordPublicRequest('proj-a');
        recordPublicRequest('proj-b');
        const c = getUsageCounts();
        expect(c.public.byProject['proj-a'].total).toBe(2);
        expect(c.public.byProject['proj-b'].total).toBe(1);
    });

    it('counts per calendar month, starting at its first day', () => {
        recordPublicRequest('proj-a');
        const c = getUsageCounts();
        expect(c.period).toMatch(/^\d{4}-\d{2}$/);
        expect(new Date(c.public.byProject['proj-a'].windowStart).getUTCDate()).toBe(1);
        expect(getUsageCounts('2001-01').public.byProject).toEqual({});
    });

    it('returns copies so external mutation does not affect store', () => {
        recordStudioRequest();
        const c = getUsageCounts();
        c.studio.total = 999;
        expect(getUsageCounts().studio.total).toBe(1);
    });
});

import { describe, it, expect, afterEach, beforeEach, afterAll } from 'vitest';
import { presenceStore } from '../src/PresenceStore';
import { getOnlineUserIdsForProject, resolveOnlinePresenceMaxIdleMs } from '../src/onlineUsers';

describe('getOnlineUserIdsForProject', () => {
    afterEach(() => {
        presenceStore.remove('sock-a');
        presenceStore.remove('sock-b');
    });

    it('returns distinct user ids with recent heartbeats', () => {
        presenceStore.update('sock-a', 'user-1', 'A', 'proj-1', {});
        presenceStore.update('sock-b', 'user-2', 'B', 'proj-1', {});
        const ids = getOnlineUserIdsForProject('proj-1');
        expect(ids.sort()).toEqual(['user-1', 'user-2']);
    });

    it('dedupes multiple sockets for the same user', () => {
        presenceStore.update('sock-a', 'user-1', 'A', 'proj-1', {});
        presenceStore.update('sock-b', 'user-1', 'A', 'proj-1', { screenId: 's2' });
        expect(getOnlineUserIdsForProject('proj-1')).toEqual(['user-1']);
    });

    it('ignores other projects', () => {
        presenceStore.update('sock-a', 'user-1', 'A', 'proj-1', {});
        presenceStore.update('sock-b', 'user-2', 'B', 'proj-2', {});
        expect(getOnlineUserIdsForProject('proj-1')).toEqual(['user-1']);
    });

    it('excludes stale presence when maxIdleMs is small', () => {
        presenceStore.update('sock-old', 'user-old', 'Old', 'proj-stale', {});
        const p = presenceStore.get('sock-old');
        expect(p).toBeDefined();
        if (p) {
            (p as { updatedAt: number }).updatedAt = Date.now() - 120_000;
        }
        expect(getOnlineUserIdsForProject('proj-stale', 60_000)).toEqual([]);
        expect(getOnlineUserIdsForProject('proj-stale', 200_000)).toEqual(['user-old']);
        presenceStore.remove('sock-old');
    });
});

describe('resolveOnlinePresenceMaxIdleMs', () => {
    const original = process.env.ONLINE_PRESENCE_MAX_IDLE_MS;

    afterAll(() => {
        if (original === undefined) delete process.env.ONLINE_PRESENCE_MAX_IDLE_MS;
        else process.env.ONLINE_PRESENCE_MAX_IDLE_MS = original;
    });

    beforeEach(() => {
        delete process.env.ONLINE_PRESENCE_MAX_IDLE_MS;
    });

    it('defaults to 90_000 when unset', () => {
        expect(resolveOnlinePresenceMaxIdleMs()).toBe(90_000);
    });

    it('parses env milliseconds', () => {
        process.env.ONLINE_PRESENCE_MAX_IDLE_MS = '45000';
        expect(resolveOnlinePresenceMaxIdleMs()).toBe(45_000);
    });

    it('falls back when value is invalid', () => {
        process.env.ONLINE_PRESENCE_MAX_IDLE_MS = 'not-a-number';
        expect(resolveOnlinePresenceMaxIdleMs()).toBe(90_000);
        process.env.ONLINE_PRESENCE_MAX_IDLE_MS = '500';
        expect(resolveOnlinePresenceMaxIdleMs()).toBe(90_000);
    });

    it('caps very large values', () => {
        process.env.ONLINE_PRESENCE_MAX_IDLE_MS = '999999999';
        expect(resolveOnlinePresenceMaxIdleMs()).toBe(86_400_000);
    });
});

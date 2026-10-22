import { describe, it, expect, afterEach, beforeEach, afterAll } from 'vitest';
import { resolveOnlinePresenceMaxIdleMs } from '../src/onlinePresence.js';

describe('resolveOnlinePresenceMaxIdleMs', () => {
    const original = process.env.ONLINE_PRESENCE_MAX_IDLE_MS;

    afterAll(() => {
        if (original === undefined) delete process.env.ONLINE_PRESENCE_MAX_IDLE_MS;
        else process.env.ONLINE_PRESENCE_MAX_IDLE_MS = original;
    });

    beforeEach(() => {
        delete process.env.ONLINE_PRESENCE_MAX_IDLE_MS;
    });

    afterEach(() => {
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

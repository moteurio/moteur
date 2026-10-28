import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    cachedAnswer,
    clearDeliveryCache,
    deliveryCacheEnabled,
    keepAnswer,
    projectVersion
} from '../src/deliveryCache.js';
import { triggerEvent } from '../src/utils/eventBus.js';

describe('the delivery cache', () => {
    afterEach(() => {
        clearDeliveryCache();
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it('moves a project on with any event about it', async () => {
        const before = projectVersion('p1');
        await triggerEvent('content.saved', {
            projectId: 'p1',
            paths: ['x.json'],
            message: 'm',
            user: { id: 'u' } as never
        });
        expect(projectVersion('p1')).toBeGreaterThan(before);
        expect(projectVersion('p2')).toBe(0);
    });

    it('keeps an answer for its version only, and never one read across a change', async () => {
        const v = projectVersion('p3');
        keepAnswer('p3', v, 'GET /a', '{"a":1}', {});
        expect(cachedAnswer('p3', v, 'GET /a')?.body).toBe('{"a":1}');

        // Read before a change, kept after it: thrown away.
        const started = projectVersion('p3');
        await triggerEvent('content.saved', {
            projectId: 'p3',
            paths: [],
            message: '',
            user: { id: 'u' } as never
        });
        keepAnswer('p3', started, 'GET /b', '{"stale":true}', {});
        expect(cachedAnswer('p3', started, 'GET /b')).toBeUndefined();
        expect(cachedAnswer('p3', projectVersion('p3'), 'GET /a')).toBeUndefined();
    });

    it('lets an answer go after its age, and can be turned off', () => {
        vi.useFakeTimers({ now: Date.parse('2026-10-28T12:00:00Z') });
        const v = projectVersion('p4');
        keepAnswer('p4', v, 'GET /a', '{}', {});
        vi.advanceTimersByTime(4_000);
        expect(cachedAnswer('p4', v, 'GET /a')).toBeDefined();
        vi.advanceTimersByTime(2_000);
        expect(cachedAnswer('p4', v, 'GET /a')).toBeUndefined();

        vi.stubEnv('MOTEUR_DELIVERY_CACHE_SECONDS', '0');
        expect(deliveryCacheEnabled()).toBe(false);
    });
});

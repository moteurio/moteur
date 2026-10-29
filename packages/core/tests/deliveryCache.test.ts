import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    cachedAnswer,
    clearDeliveryCache,
    deliveryCacheEnabled,
    keepAnswer,
    perVersion,
    projectVersion,
    reachesSites,
    touchProject
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

    it('keeps answers through what never reaches a site', async () => {
        const before = projectVersion('p5');
        await triggerEvent('form.submitted', { projectId: 'p5' } as never);
        await triggerEvent('comment.added', { projectId: 'p5' } as never);
        expect(projectVersion('p5')).toBe(before);
        expect(reachesSites('user-data/forms/contact/s1.json')).toBe(false);
        expect(reachesSites('.moteur/comments.json')).toBe(false);
        expect(reachesSites('preview-tokens')).toBe(false);
        expect(reachesSites('models/post/entries/a/entry.json')).toBe(true);
        expect(reachesSites('pages/home.json')).toBe(true);
    });

    it('works a project’s shared values out once per version, and again after a failure', async () => {
        let runs = 0;
        const compute = async () => ++runs;
        expect(await perVersion('p6', 'pages', compute)).toBe(1);
        expect(await perVersion('p6', 'pages', compute)).toBe(1);
        touchProject('p6');
        expect(await perVersion('p6', 'pages', compute)).toBe(2);
        const failing = () => Promise.reject(new Error('disk'));
        await expect(perVersion('p6', 'other', failing)).rejects.toThrow('disk');
        expect(await perVersion('p6', 'other', compute)).toBe(3);
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { busy, closeWhenIdle, type Usage } from '../../src/utils/idleIndexes.js';

describe('closing idle project indexes', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it('closes those unused for a minute, never one with work queued or just used', async () => {
        vi.stubEnv('MOTEUR_INDEX_IDLE_SECONDS', '60');
        vi.useFakeTimers({ now: Date.parse('2026-10-28T12:00:00Z') });
        const open = new Map<string, Usage>([
            ['quiet', { used: Date.now(), pending: 0 }],
            ['working', { used: Date.now(), pending: 0 }],
            ['read', { used: Date.now(), pending: 0 }]
        ]);
        const closed: string[] = [];
        closeWhenIdle(open, key => {
            closed.push(key);
            open.delete(key);
        });
        let finish!: () => void;
        void busy(open.get('working')!, new Promise<void>(r => (finish = r)));
        vi.advanceTimersByTime(45_000);
        open.get('read')!.used = Date.now();
        // The sweep at 90 s: only the one unused since the start has been idle over a minute.
        vi.advanceTimersByTime(50_000);
        expect(closed).toEqual(['quiet']);

        finish();
        await Promise.resolve();
        vi.advanceTimersByTime(120_000);
        expect(closed.sort()).toEqual(['quiet', 'read', 'working']);
    });
});

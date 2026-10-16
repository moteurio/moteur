import { afterEach, describe, expect, it } from 'vitest';
import { installClock, uninstallClock, setDaysAgo, tick, present } from '../src/runtime/clock.js';

const DAY = 86_400_000;

describe('simulated clock', () => {
    afterEach(() => uninstallClock());

    it('moves new Date(), Date.now() and git dates together', () => {
        const real = Date.now();
        installClock();
        setDaysAgo(10);
        expect(Math.abs(Date.now() - (real - 10 * DAY))).toBeLessThan(5000);
        expect(Math.abs(new Date().getTime() - Date.now())).toBeLessThan(5);
        expect(process.env.GIT_AUTHOR_DATE).toBe(
            new Date().toISOString().slice(0, 19) + process.env.GIT_AUTHOR_DATE!.slice(19)
        );
        const before = Date.now();
        tick(60);
        expect(Date.now() - before).toBeGreaterThanOrEqual(60 * 60_000 - 5);
        present();
        expect(Math.abs(Date.now() - real)).toBeLessThan(5000);
    });

    it('keeps explicit dates untouched and restores the real Date', () => {
        installClock();
        setDaysAgo(100);
        expect(new Date('2000-01-01T00:00:00Z').toISOString()).toBe('2000-01-01T00:00:00.000Z');
        uninstallClock();
        expect(Math.abs(Date.now() - new Date().getTime())).toBeLessThan(5);
        expect(process.env.GIT_AUTHOR_DATE).toBeUndefined();
    });
});

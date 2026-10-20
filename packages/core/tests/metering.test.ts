import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createFileMeteringStore,
    createMemoryMeteringStore,
    creditBalance,
    currentPeriod,
    grantCredits,
    periodBounds,
    recentPeriods,
    recordRequest,
    getMeteringStore,
    setCreditAllowance,
    setMeteringStore,
    spendCredits
} from '../src/metering';

beforeEach(() => {
    setMeteringStore(createMemoryMeteringStore());
    setCreditAllowance(null);
    vi.stubEnv('MOTEUR_AI_CREDITS_DISABLED', '');
    vi.stubEnv('MOTEUR_AI_MONTHLY_CREDITS', '');
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('periods', () => {
    it('are calendar months in UTC', () => {
        expect(currentPeriod(new Date('2026-10-31T23:30:00-04:00'))).toBe('2026-11');
        expect(periodBounds('2026-12')).toEqual({
            start: '2026-12-01T00:00:00.000Z',
            end: '2027-01-01T00:00:00.000Z'
        });
        expect(recentPeriods(3, '2026-02')).toEqual(['2025-12', '2026-01', '2026-02']);
    });
});

describe('credits', () => {
    it('spend against the monthly allowance, 1000 by default', () => {
        expect(spendCredits('p1', 250, { reason: 'write' })).toEqual({
            success: true,
            remaining: 750
        });
        expect(spendCredits('p1', 800)).toEqual({ success: false, remaining: 750 });
        expect(creditBalance('p1')).toMatchObject({ allowance: 1000, used: 250, remaining: 750 });
        expect(getMeteringStore().creditEntries('p1', currentPeriod())).toHaveLength(1);
    });

    it('take the allowance from the host, per project', () => {
        setCreditAllowance(id => (id === 'pro' ? 5000 : id === 'big' ? null : 100));
        expect(creditBalance('pro').remaining).toBe(5000);
        expect(creditBalance('free').remaining).toBe(100);
        expect(creditBalance('big')).toMatchObject({ allowance: null, remaining: null });
        expect(spendCredits('big', 1_000_000).success).toBe(true);
    });

    it('read the allowance from the environment', () => {
        vi.stubEnv('MOTEUR_AI_MONTHLY_CREDITS', '40');
        expect(creditBalance('p1').remaining).toBe(40);
        vi.stubEnv('MOTEUR_AI_MONTHLY_CREDITS', 'unlimited');
        expect(creditBalance('p1').remaining).toBeNull();
        vi.stubEnv('MOTEUR_AI_MONTHLY_CREDITS', '');
        vi.stubEnv('MOTEUR_AI_CREDITS_DISABLED', '1');
        setCreditAllowance(() => 5);
        expect(creditBalance('p1').remaining).toBeNull();
    });

    it('grants add to this month, and can take back', () => {
        grantCredits('p1', 500, { reason: 'top-up' });
        expect(creditBalance('p1')).toMatchObject({ granted: 500, remaining: 1500 });
        grantCredits('p1', -2000);
        expect(creditBalance('p1').remaining).toBe(0);
    });

    it('start again each month', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
        spendCredits('p1', 1000);
        expect(creditBalance('p1').remaining).toBe(0);
        vi.setSystemTime(new Date('2026-11-01T00:00:01Z'));
        expect(creditBalance('p1').remaining).toBe(1000);
        expect(creditBalance('p1', '2026-10').used).toBe(1000);
    });
});

describe('file store', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-metering-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('keeps credits and request counts across a restart', () => {
        setMeteringStore(createFileMeteringStore(dir, 60_000));
        spendCredits('p1', 30, { reason: 'translate.entry' });
        recordRequest('public', 'p1');
        recordRequest('public', 'p1');
        recordRequest('studio');
        getMeteringStore().flush();

        setMeteringStore(createFileMeteringStore(dir, 60_000));
        const period = currentPeriod();
        expect(creditBalance('p1').used).toBe(30);
        expect(getMeteringStore().creditEntries('p1', period)[0]).toMatchObject({
            type: 'spend',
            amount: 30,
            reason: 'translate.entry'
        });
        expect(getMeteringStore().requestTotals(period)).toEqual({
            studio: 1,
            projects: { p1: { publicRequests: 2, studioRequests: 0 } }
        });
    });

    it('writes a spend at once, before any flush', () => {
        setMeteringStore(createFileMeteringStore(dir, 60_000));
        spendCredits('p1', 7);
        const fresh = createFileMeteringStore(dir, 60_000);
        expect(fresh.creditTotals('p1', currentPeriod()).used).toBe(7);
    });

    it('skips a damaged ledger line', () => {
        const period = currentPeriod();
        fs.writeFileSync(
            path.join(dir, `credits-${period}.jsonl`),
            `${JSON.stringify({ at: '', projectId: 'p1', period, type: 'spend', amount: 5 })}\n{oops\n`
        );
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(createFileMeteringStore(dir, 60_000).creditTotals('p1', period).used).toBe(5);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

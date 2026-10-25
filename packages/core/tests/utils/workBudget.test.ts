import { describe, expect, it } from 'vitest';
import { WorkBudget } from '../../src/utils/workBudget.js';

describe('bounded work', () => {
    it('caps active work, rejects overflow, and releases queued callers after errors', async () => {
        const budget = new WorkBudget(1, 1);
        let release!: () => void;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const events: string[] = [];
        const first = budget.run(async () => {
            events.push('first');
            await gate;
            throw new Error('worker failed');
        });
        const rejected = expect(first).rejects.toThrow('worker failed');
        const second = budget.run(async () => {
            events.push('second');
            return 'done';
        });
        await expect(budget.run(async () => 'overflow')).rejects.toMatchObject({ status: 429 });
        expect(events).toEqual(['first']);
        release();
        await rejected;
        await expect(second).resolves.toBe('done');
        await expect(budget.run(async () => 'reused')).resolves.toBe('reused');
    });
    it('allows nested processing without deadlocking the worker', async () => {
        const budget = new WorkBudget(1, 0);
        await expect(budget.run(() => budget.run(async () => 'nested'))).resolves.toBe('nested');
    });
});

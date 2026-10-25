import { describe, expect, it, vi } from 'vitest';
import { EntryReadBudget } from '../../src/utils/entryReadBudget.js';

describe('delivery work budget', () => {
    const entry = { id: 'e1', type: 'articles', data: { title: 'Content' } };
    it('bounds reference edges even when the same entry is repeatedly inlined', async () => {
        const fetch = vi.fn().mockResolvedValue(entry);
        const budget = new EntryReadBudget(fetch, 2, 10_000);
        await budget.resolve('p1', 'articles', 'e1');
        await budget.resolve('p1', 'articles', 'e1');
        await expect(budget.resolve('p1', 'articles', 'e1')).rejects.toMatchObject({
            code: 'READ_BUDGET_EXCEEDED'
        });
        expect(fetch).toHaveBeenCalledOnce();
    });
    it('shares the byte budget between roots and resolved entries', async () => {
        const budget = new EntryReadBudget(vi.fn().mockResolvedValue(entry), 200, 100);
        budget.include(entry);
        await expect(budget.resolve('p1', 'articles', 'e1')).rejects.toMatchObject({ status: 422 });
    });
});

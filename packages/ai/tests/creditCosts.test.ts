import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCreditCost, resetCreditCostOverrides } from '../src/creditCosts.js';

describe('creditCosts', () => {
    const prev = process.env.MOTEUR_AI_CREDIT_COSTS;

    beforeEach(() => {
        delete process.env.MOTEUR_AI_CREDIT_COSTS;
        resetCreditCostOverrides();
    });

    afterEach(() => {
        process.env.MOTEUR_AI_CREDIT_COSTS = prev;
        resetCreditCostOverrides();
    });

    it('uses defaults when no env override is provided', () => {
        expect(getCreditCost('write.draft')).toBe(2);
        expect(getCreditCost('unknown.operation')).toBe(1);
    });

    it('applies valid env overrides and ignores invalid values', () => {
        process.env.MOTEUR_AI_CREDIT_COSTS = JSON.stringify({
            'write.draft': 9,
            'generate.image': 12,
            'translate.entry': -1,
            'write.tone': 'x'
        });
        resetCreditCostOverrides();

        expect(getCreditCost('write.draft')).toBe(9);
        expect(getCreditCost('generate.image')).toBe(12);
        expect(getCreditCost('translate.entry')).toBe(5);
        expect(getCreditCost('write.tone')).toBe(1);
    });

    it('falls back to defaults when env override is invalid JSON', () => {
        process.env.MOTEUR_AI_CREDIT_COSTS = '{not-json';
        resetCreditCostOverrides();

        expect(getCreditCost('generate.entry')).toBe(5);
    });
});

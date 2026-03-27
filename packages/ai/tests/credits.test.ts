import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCredits, deductCredits, setCredits, isAiCreditsDisabled } from '../src/credits.js';

describe('credits', () => {
    const prev = process.env.MOTEUR_AI_CREDITS_DISABLED;

    beforeEach(() => {
        delete process.env.MOTEUR_AI_CREDITS_DISABLED;
    });

    afterEach(() => {
        process.env.MOTEUR_AI_CREDITS_DISABLED = prev;
    });

    it('initializes credits per project and deducts correctly', () => {
        expect(getCredits('p1')).toBe(1000);

        const ok = deductCredits('p1', 250);
        expect(ok).toEqual({ success: true, remaining: 750 });

        const fail = deductCredits('p1', 800);
        expect(fail).toEqual({ success: false, remaining: 750 });
    });

    it('supports setting credits explicitly for tests', () => {
        setCredits('p2', 3);
        expect(deductCredits('p2', 2)).toEqual({ success: true, remaining: 1 });
    });

    it('disables credit checks when env flag is truthy', () => {
        process.env.MOTEUR_AI_CREDITS_DISABLED = 'yes';
        expect(isAiCreditsDisabled()).toBe(true);

        expect(getCredits('p3')).toBe(1_000_000);
        expect(deductCredits('p3', 999_999)).toEqual({
            success: true,
            remaining: 1_000_000
        });
    });
});

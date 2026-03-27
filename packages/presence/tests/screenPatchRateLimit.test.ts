import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { allowScreenPatchRateLimit, clearScreenPatchRateLimit } from '../src/screenPatchRateLimit';

const SOCKET = 'sock-rl';

describe('screenPatchRateLimit', () => {
    beforeEach(() => {
        clearScreenPatchRateLimit(SOCKET);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('allows up to 50 patches per 1s window', () => {
        const t0 = 1_000_000;
        vi.setSystemTime(t0);
        for (let i = 0; i < 50; i++) {
            expect(allowScreenPatchRateLimit(SOCKET)).toBe(true);
        }
        expect(allowScreenPatchRateLimit(SOCKET)).toBe(false);
    });

    it('resets after the window slides', () => {
        vi.setSystemTime(2_000_000);
        for (let i = 0; i < 50; i++) {
            expect(allowScreenPatchRateLimit(SOCKET)).toBe(true);
        }
        vi.setSystemTime(2_001_001);
        expect(allowScreenPatchRateLimit(SOCKET)).toBe(true);
    });
});

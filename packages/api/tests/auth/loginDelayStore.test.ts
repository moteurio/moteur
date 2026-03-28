import { describe, it, expect, beforeEach } from 'vitest';
import {
    delayMsForAttempt,
    nextRetryAfterSeconds,
    recordLoginFailure,
    resetLoginDelayStoreForTests,
    sweepStaleLoginFailures,
    getLoginFailureEntry,
    LOGIN_FAILURE_TTL_MS
} from '../../src/auth/loginDelayStore';

describe('loginDelayStore', () => {
    beforeEach(() => {
        resetLoginDelayStoreForTests();
    });

    it('delayMsForAttempt matches schedule (seconds)', () => {
        expect(delayMsForAttempt(0)).toBe(0);
        expect(delayMsForAttempt(1)).toBe(1000);
        expect(delayMsForAttempt(2)).toBe(2000);
        expect(delayMsForAttempt(4)).toBe(8000);
        expect(delayMsForAttempt(7)).toBe(30000);
        expect(delayMsForAttempt(9)).toBe(30000);
    });

    it('nextRetryAfterSeconds matches post-failure hint', () => {
        expect(nextRetryAfterSeconds(1)).toBe(1);
        expect(nextRetryAfterSeconds(2)).toBe(2);
        expect(nextRetryAfterSeconds(4)).toBe(8);
        expect(nextRetryAfterSeconds(7)).toBe(30);
    });

    it('sweepStaleLoginFailures removes entries older than TTL', () => {
        const email = 'sweep@test.local';
        recordLoginFailure(email);
        const entry = getLoginFailureEntry(email)!;
        entry.lastFailAt = Date.now() - LOGIN_FAILURE_TTL_MS - 1;
        sweepStaleLoginFailures();
        expect(getLoginFailureEntry(email)).toBeUndefined();
    });
});

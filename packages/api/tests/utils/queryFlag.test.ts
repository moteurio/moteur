import { describe, it, expect } from 'vitest';
import { queryFlag } from '../../src/utils/queryFlag.js';

describe('queryFlag', () => {
    it.each(['1', 'true', 'TRUE', 'yes', ' true '])('treats %j as on', v => {
        expect(queryFlag(v)).toBe(true);
    });

    it.each(['0', 'false', '', 'no', undefined, null, 1])('treats %j as off', v => {
        expect(queryFlag(v)).toBe(false);
    });

    it('reads the first value of a repeated parameter', () => {
        expect(queryFlag(['true', 'false'])).toBe(true);
    });
});

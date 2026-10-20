import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assertCountRoom,
    assertPeopleRoom,
    assertProjectRoom,
    assertRequestRoom,
    assertStorageRoom,
    assertSubmissionRoom,
    checkCountRoom,
    formatBytes,
    getCountLimits,
    getPeopleLimit,
    PlanLimitError,
    setCountLimit,
    setPeopleLimit,
    setProjectsLimit,
    setRequestQuota,
    setStorageLimit,
    setSubmissionQuota
} from '../src/planLimits';

afterEach(() => {
    setPeopleLimit(null);
    setStorageLimit(null);
    setRequestQuota(null);
    setProjectsLimit(null);
    setCountLimit(null);
    setSubmissionQuota(null);
});

const MB = 1024 * 1024;

function thrown(fn: () => void): unknown {
    try {
        fn();
    } catch (err) {
        return err;
    }
    return undefined;
}

describe('storage limit', () => {
    it('refuses a file that would go over, and says how much the plan allows', () => {
        setStorageLimit(() => 100 * MB);
        expect(() => assertStorageRoom('p1', 60 * MB, 40 * MB)).not.toThrow();
        const err = thrown(() => assertStorageRoom('p1', 60 * MB, 41 * MB));
        expect(err).toMatchObject({ status: 402, limit: 'storage', max: 100 * MB });
        expect((err as Error).message).toContain('100 MB');
    });

    it('does not limit without a host', () => {
        expect(() => assertStorageRoom('p1', 10 ** 12, 10 ** 12)).not.toThrow();
    });
});

describe('request quota', () => {
    it('turns requests away once the month’s quota is answered', () => {
        setRequestQuota(() => 2000);
        expect(() => assertRequestRoom('p1', 1999)).not.toThrow();
        expect(thrown(() => assertRequestRoom('p1', 2000))).toMatchObject({
            limit: 'requests',
            max: 2000
        });
    });
});

describe('submission quota', () => {
    it('turns submissions away once the month’s quota is received', () => {
        setSubmissionQuota(() => 100);
        expect(() => assertSubmissionRoom('p1', 99)).not.toThrow();
        const err = thrown(() => assertSubmissionRoom('p1', 100));
        expect(err).toMatchObject({ status: 402, limit: 'submissions', max: 100 });
        expect((err as Error).message).toContain('100 submissions');
    });
});

describe('projects limit', () => {
    it('lets someone start projects until they have taken all they may', () => {
        setProjectsLimit(userId =>
            userId === 'u-full' ? { taken: 1, max: 1 } : { taken: 0, max: 1 }
        );
        expect(() => assertProjectRoom('u-new')).not.toThrow();
        expect(thrown(() => assertProjectRoom('u-full'))).toBeInstanceOf(PlanLimitError);
    });

    it('does not limit when the lookup fails', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setProjectsLimit(() => {
            throw new Error('store down');
        });
        expect(() => assertProjectRoom('u1')).not.toThrow();
        warn.mockRestore();
    });
});

describe('count limits', () => {
    it('refuses one more of a kind once the plan’s number is reached, and names it', () => {
        setCountLimit((_, kind) => (kind === 'models' ? 5 : kind === 'channels' ? 1 : null));
        expect(() => assertCountRoom('p1', 'models', 4)).not.toThrow();
        const err = thrown(() => assertCountRoom('p1', 'models', 5));
        expect(err).toMatchObject({ status: 402, limit: 'models', max: 5 });
        expect((err as Error).message).toContain('5 models');
        expect((thrown(() => assertCountRoom('p1', 'channels', 1)) as Error).message).toContain(
            '1 API channel.'
        );
        expect(() => assertCountRoom('p1', 'entries', 10 ** 9)).not.toThrow();
    });

    it('only counts when there is a limit', async () => {
        const count = vi.fn(() => 200);
        await checkCountRoom('p1', 'entries', count);
        expect(count).not.toHaveBeenCalled();
        setCountLimit(() => 200);
        await expect(checkCountRoom('p1', 'entries', count)).rejects.toBeInstanceOf(PlanLimitError);
        expect(getCountLimits('p1').pages).toBe(200);
    });
});

describe('formatBytes', () => {
    it('states sizes the way plans do', () => {
        expect(formatBytes(100 * MB)).toBe('100 MB');
        expect(formatBytes(2 * 1024 * MB)).toBe('2 GB');
        expect(formatBytes(1.5 * MB)).toBe('1.5 MB');
    });
});

describe('people limit', () => {
    it('does not limit until a host says so', () => {
        expect(getPeopleLimit('p1')).toBeNull();
        expect(() => assertPeopleRoom('p1', 500)).not.toThrow();
    });

    it('refuses going over, per project', () => {
        setPeopleLimit(id => (id === 'small' ? 3 : null));
        expect(() => assertPeopleRoom('small', 2)).not.toThrow();
        expect(() => assertPeopleRoom('small', 3)).toThrow(PlanLimitError);
        expect(() => assertPeopleRoom('big', 3000)).not.toThrow();
        let caught: unknown;
        try {
            assertPeopleRoom('small', 2, 2);
        } catch (err) {
            caught = err;
        }
        expect(caught).toMatchObject({ status: 402, code: 'plan_limit', limit: 'people', max: 3 });
    });

    it('lets a project already over its limit keep its people', () => {
        setPeopleLimit(() => 3);
        expect(() => assertPeopleRoom('p1', 5, 0)).not.toThrow();
        expect(() => assertPeopleRoom('p1', 5, -1)).not.toThrow();
    });

    it('does not limit when the lookup fails or answers nonsense', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setPeopleLimit(() => {
            throw new Error('no billing record');
        });
        expect(getPeopleLimit('p1')).toBeNull();
        setPeopleLimit(() => Number.NaN);
        expect(getPeopleLimit('p1')).toBeNull();
        warn.mockRestore();
    });
});

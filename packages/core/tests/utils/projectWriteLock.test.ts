import { describe, expect, it } from 'vitest';
import { withProjectWriteLock } from '../../src/utils/projectWriteLock.js';

describe('project write serialization', () => {
    it('serializes writes to one project and allows nested service calls', async () => {
        const events: string[] = [];
        await Promise.all([
            withProjectWriteLock('lock-test', async () => {
                events.push('first');
                await withProjectWriteLock('lock-test', async () => {
                    events.push('nested');
                });
                await Promise.resolve();
                events.push('first done');
            }),
            withProjectWriteLock('lock-test', async () => {
                events.push('second');
            })
        ]);
        expect(events).toEqual(['first', 'nested', 'first done', 'second']);
    });
    it('releases the queue after a rejected write', async () => {
        const failed = withProjectWriteLock('lock-error-test', async () => {
            throw new Error('failed write');
        });
        const next = withProjectWriteLock('lock-error-test', async () => 'saved');
        await expect(failed).rejects.toThrow('failed write');
        await expect(next).resolves.toBe('saved');
    });
});

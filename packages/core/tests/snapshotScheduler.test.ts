import { afterEach, describe, it, expect } from 'vitest';
import { startSnapshotScheduler, stopSnapshotScheduler } from '../src/snapshotScheduler.js';

describe('snapshotScheduler', () => {
    afterEach(() => {
        stopSnapshotScheduler();
    });

    it('does not throw when started and stopped', () => {
        startSnapshotScheduler(60_000);
        expect(() => stopSnapshotScheduler()).not.toThrow();
    });

    it('can be started with short interval for testing', () => {
        startSnapshotScheduler(100);
        stopSnapshotScheduler();
    });
});

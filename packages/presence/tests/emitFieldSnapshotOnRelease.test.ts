import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emitFieldSnapshotOnRelease } from '../src/emitFieldSnapshotOnRelease';
import { screenEphemeralStore } from '../src/ScreenEphemeralStore';

const SCREEN = 'screen-snapshot-test';

describe('emitFieldSnapshotOnRelease', () => {
    beforeEach(() => {
        screenEphemeralStore.clearScreen(SCREEN);
    });

    it('emits screen:change with stored value', () => {
        screenEphemeralStore.applyPatch(SCREEN, 'u1', 1, { 'entry:e1:title': '"hi"' });
        const emit = vi.fn();
        emitFieldSnapshotOnRelease({ emit } as never, {
            projectId: 'p1',
            screenId: SCREEN,
            fieldPath: 'entry:e1:title',
            userId: 'u1',
            reason: 'test'
        });
        expect(emit).toHaveBeenCalledWith(
            'screen:change',
            expect.objectContaining({
                screenId: SCREEN,
                fields: { 'entry:e1:title': '"hi"' },
                ui: {},
                originUserId: 'u1'
            })
        );
    });

    it('emits empty string when field is unset', () => {
        const emit = vi.fn();
        emitFieldSnapshotOnRelease({ emit } as never, {
            projectId: 'p1',
            screenId: SCREEN,
            fieldPath: 'entry:e1:title',
            userId: 'u1',
            reason: 'test'
        });
        expect(emit).toHaveBeenCalledWith(
            'screen:change',
            expect.objectContaining({
                fields: { 'entry:e1:title': '' }
            })
        );
    });
});

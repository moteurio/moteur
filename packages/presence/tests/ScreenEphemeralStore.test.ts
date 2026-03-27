import { describe, it, expect, beforeEach } from 'vitest';
import { ScreenEphemeralStore } from '../src/ScreenEphemeralStore';

describe('ScreenEphemeralStore', () => {
    let store: ScreenEphemeralStore;

    beforeEach(() => {
        store = new ScreenEphemeralStore();
    });

    it('applies field patch with LWW', () => {
        const t1 = 100;
        const t2 = 200;
        store.applyPatch('s1', 'u1', t1, { a: 'first' });
        store.applyPatch('s1', 'u2', t2, { a: 'second' });
        expect(store.getField('s1', 'a')).toBe('second');
    });

    it('ignores older timestamp', () => {
        store.applyPatch('s1', 'u1', 200, { a: 'new' });
        store.applyPatch('s1', 'u2', 100, { a: 'stale' });
        expect(store.getField('s1', 'a')).toBe('new');
    });

    it('separates fields and ui', () => {
        store.applyPatch('s1', 'u1', 1, { f: 'x' }, { tab: 'json' });
        expect(store.getFieldsRecord('s1')).toEqual({ f: 'x' });
        expect(store.getUiRecord('s1')).toEqual({ tab: 'json' });
    });

    it('clears a field', () => {
        store.applyPatch('s1', 'u1', 1, { a: 'x' });
        store.clearField('s1', 'a');
        expect(store.getField('s1', 'a')).toBeUndefined();
    });

    it('clears screen', () => {
        store.applyPatch('s1', 'u1', 1, { a: 'x' }, { t: 'y' });
        store.clearScreen('s1');
        expect(store.getFieldsRecord('s1')).toEqual({});
    });
});

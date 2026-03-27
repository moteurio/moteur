import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PresenceStore } from '../src/PresenceStore';

describe('PresenceStore', () => {
    let store: PresenceStore;

    beforeEach(() => {
        store = new PresenceStore();
    });

    it('adds and updates presence by socket', () => {
        const result = store.update('sock1', 'user1', 'Alice', 'projA', { screenId: 'screenA' });
        expect(result.userId).toBe('user1');
        expect(store.get('sock1')?.screenId).toBe('screenA');
    });

    it('removes a socket and returns previous presence', () => {
        store.update('sock1', 'user1', 'Alice', 'projA', {});
        const removed = store.remove('sock1');
        expect(removed?.userId).toBe('user1');
        expect(store.get('sock1')).toBeUndefined();
    });

    it('filters presence by project', () => {
        store.update('s1', 'u1', 'A', 'p1', {});
        store.update('s2', 'u2', 'B', 'p2', {});
        const p1 = store.getByProject('p1');
        expect(p1.length).toBe(1);
        expect(p1[0].userId).toBe('u1');
    });

    it('filters presence by screenId', () => {
        store.update('s1', 'u1', 'A', 'p1', { screenId: 'screen1' });
        store.update('s2', 'u2', 'B', 'p1', { screenId: 'screen2' });
        const screen1 = store.getByScreen('screen1');
        expect(screen1.length).toBe(1);
        expect(screen1[0].userId).toBe('u1');
    });

    it('getLocks preserves colons inside fieldPath (namespaced keys)', () => {
        store.lockField('p1', 'entry:e1:title', 'u1');
        expect(store.getLocks('p1')).toEqual({ 'entry:e1:title': 'u1' });
    });

    it('locks and unlocks fields correctly', () => {
        store.lockField('p1', 'fieldA', 'u1');
        store.lockField('p1', 'fieldA', 'u2'); // should not override
        expect(store.getLocks('p1')).toEqual({ fieldA: 'u1' });

        store.unlockField('p1', 'fieldA', 'u2'); // should not unlock
        expect(store.getLocks('p1')).toEqual({ fieldA: 'u1' });

        store.unlockField('p1', 'fieldA', 'u1'); // should unlock
        expect(store.getLocks('p1')).toEqual({});
    });

    it('unlocks all fields for a user in a project', () => {
        store.lockField('p1', 'fieldA', 'u1');
        store.lockField('p1', 'fieldB', 'u1');
        store.lockField('p2', 'fieldA', 'u1');
        store.unlockAllForUser('u1', 'p1');
        expect(store.getLocks('p1')).toEqual({});
        expect(store.getLocks('p2')).toEqual({ fieldA: 'u1' });
    });

    it('returns screenId for socket', () => {
        store.update('s1', 'u1', 'A', 'p1', { screenId: 'xyz' });
        expect(store.getScreen('s1')).toBe('xyz');
    });

    it('clears fieldPath when update explicitly clears it', () => {
        store.update('s1', 'u1', 'A', 'p1', { fieldPath: 'entry:e1:title' });
        expect(store.get('s1')?.fieldPath).toBe('entry:e1:title');
        store.update('s1', 'u1', 'A', 'p1', Object.assign({}, { fieldPath: undefined }));
        expect(store.get('s1')?.fieldPath).toBeUndefined();
    });

    it('tryLockField acquires when free and returns true', () => {
        expect(store.tryLockField('p1', 'cover.alt', 'ai:image-analysis')).toBe(true);
        expect(store.getLocks('p1')).toEqual({ 'cover.alt': 'ai:image-analysis' });
    });

    it('tryLockField returns false when field is held by another user', () => {
        store.lockField('p1', 'cover.alt', 'u1');
        expect(store.tryLockField('p1', 'cover.alt', 'ai:image-analysis')).toBe(false);
        expect(store.getLocks('p1')).toEqual({ 'cover.alt': 'u1' });
    });

    it('preserves overlayId when later updates omit overlayId', () => {
        store.update('s1', 'u1', 'A', 'p1', { overlayId: 'translate-entry' });
        expect(store.get('s1')?.overlayId).toBe('translate-entry');
        store.update('s1', 'u1', 'A', 'p1', { cursor: { x: 10, y: 20 } });
        expect(store.get('s1')?.overlayId).toBe('translate-entry');
    });

    it('clears overlayId when update sets overlayId to empty string', () => {
        store.update('s1', 'u1', 'A', 'p1', { overlayId: 'modal-a' });
        store.update('s1', 'u1', 'A', 'p1', { overlayId: '' });
        expect(store.get('s1')?.overlayId).toBeUndefined();
    });

    it('getEffectiveCollaborationMode is exclusive only when all peers are exclusive', () => {
        store.update('a', 'u1', 'A', 'p1', { collaborationMode: 'exclusive' });
        expect(store.getEffectiveCollaborationMode('p1')).toBe('exclusive');
        store.update('b', 'u2', 'B', 'p1', { collaborationMode: 'shared' });
        expect(store.getEffectiveCollaborationMode('p1')).toBe('shared');
    });

    it('clearFieldLocksForProject removes locks for that project only', () => {
        store.lockField('p1', 'f1', 'u1');
        store.lockField('p2', 'f1', 'u1');
        store.clearFieldLocksForProject('p1');
        expect(store.getLocks('p1')).toEqual({});
        expect(store.getLocks('p2')).toEqual({ f1: 'u1' });
    });

    it('tryLockField clears stale lock when ttlMs exceeded', () => {
        const now = vi.spyOn(Date, 'now');
        now.mockReturnValue(1_000_000);
        store.lockField('p1', 'f', 'u1');
        now.mockReturnValue(1_000_000 + 100_001);
        expect(store.tryLockField('p1', 'f', 'u2', { ttlMs: 100_000 })).toBe(true);
        expect(store.getLocks('p1')).toEqual({ f: 'u2' });
        now.mockRestore();
    });
});

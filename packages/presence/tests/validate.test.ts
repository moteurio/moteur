import { describe, it, expect } from 'vitest';
import {
    validatePresenceUpdate,
    validateJoinPayload,
    validateScreenPatch,
    validateLeavePayload
} from '../src/validate.js';

describe('validateLeavePayload', () => {
    it('accepts trimmed projectId', () => {
        expect(validateLeavePayload({ projectId: '  demo  ' })).toBe('demo');
    });

    it('rejects missing or empty projectId', () => {
        expect(validateLeavePayload(null)).toBeNull();
        expect(validateLeavePayload({})).toBeNull();
        expect(validateLeavePayload({ projectId: '' })).toBeNull();
    });
});

describe('validateJoinPayload', () => {
    it('accepts projectId and optional screenId', () => {
        expect(
            validateJoinPayload({ projectId: 'demo', screenId: 'models/m1/entries/e1' })
        ).toEqual({
            projectId: 'demo',
            screenId: 'models/m1/entries/e1'
        });
    });

    it('treats empty screenId as omitted', () => {
        expect(validateJoinPayload({ projectId: 'demo', screenId: '' })).toEqual({
            projectId: 'demo',
            screenId: undefined
        });
    });

    it('accepts collaborationMode', () => {
        expect(validateJoinPayload({ projectId: 'demo', collaborationMode: 'exclusive' })).toEqual({
            projectId: 'demo',
            screenId: undefined,
            collaborationMode: 'exclusive'
        });
    });

    it('rejects missing projectId', () => {
        expect(validateJoinPayload({ screenId: 'x' })).toBeNull();
    });

    it('ignores invalid collaborationMode string', () => {
        const v = validateJoinPayload({ projectId: 'demo', collaborationMode: 'nope' });
        expect(v).toEqual({ projectId: 'demo', screenId: undefined, collaborationMode: undefined });
    });
});
describe('validatePresenceUpdate', () => {
    it('accepts overlayId and clears on empty string', () => {
        expect(validatePresenceUpdate({ overlayId: 'translate-entry' })).toMatchObject({
            overlayId: 'translate-entry'
        });
        expect(validatePresenceUpdate({ overlayId: '' })).toMatchObject({
            overlayId: undefined
        });
        expect(validatePresenceUpdate({ overlayId: null })).toMatchObject({
            overlayId: undefined
        });
    });

    it('rejects overlayId with invalid characters', () => {
        expect(validatePresenceUpdate({ overlayId: 'foo bar' })).toBeNull();
    });

    it('accepts cursor and fieldPath together', () => {
        const u = validatePresenceUpdate({
            fieldPath: 'entry:e1:title',
            cursor: { x: 50, y: 50 }
        });
        expect(u).toMatchObject({
            fieldPath: 'entry:e1:title',
            cursor: { x: 50, y: 50 }
        });
    });

    it('accepts pointerPulse near server time', () => {
        const now = Date.now();
        const u = validatePresenceUpdate({ pointerPulse: now, cursor: { x: 1, y: 2 } });
        expect(u).toMatchObject({ pointerPulse: now, cursor: { x: 1, y: 2 } });
    });

    it('drops pointerPulse far in the past but keeps the rest', () => {
        const u = validatePresenceUpdate({
            pointerPulse: Date.now() - 200_000,
            cursor: { x: 0, y: 0 }
        });
        expect(u).toMatchObject({ cursor: { x: 0, y: 0 } });
        expect(u?.pointerPulse).toBeUndefined();
    });
});

describe('validateScreenPatch', () => {
    it('accepts ui keys with colons (layout tabs, namespaced keys)', () => {
        const v = validateScreenPatch({
            screenId: 'models/m1/entries/e1',
            ui: { 'layoutTab:core': 'json' }
        });
        expect(v).toEqual({
            screenId: 'models/m1/entries/e1',
            fields: undefined,
            ui: { 'layoutTab:core': 'json' }
        });
    });

    it('accepts fields and ui together', () => {
        const v = validateScreenPatch({
            screenId: 'x',
            fields: { 'entry:e1:title': 'hello' },
            ui: { tab: 'visual' }
        });
        expect(v).toMatchObject({
            screenId: 'x',
            fields: { 'entry:e1:title': 'hello' },
            ui: { tab: 'visual' }
        });
    });

    it('rejects when fields or ui has too many keys', () => {
        const many: Record<string, string> = {};
        for (let i = 0; i < 81; i++) many[`k${i}`] = 'v';
        expect(validateScreenPatch({ screenId: 'x', fields: many })).toBeNull();
        expect(validateScreenPatch({ screenId: 'x', ui: many })).toBeNull();
    });

    it('rejects invalid field key characters', () => {
        expect(validateScreenPatch({ screenId: 'x', fields: { 'bad key': 'v' } })).toBeNull();
    });

    it('rejects non-object fields', () => {
        expect(
            validateScreenPatch({ screenId: 'x', fields: [] as unknown as Record<string, string> })
        ).toBeNull();
    });
});

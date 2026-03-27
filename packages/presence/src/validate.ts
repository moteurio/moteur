/**
 * Lightweight validation for presence payloads. Reject or trim invalid input.
 */
import type { PresenceUpdate } from '@moteurio/types/Presence';

const MAX_STRING_LENGTH = 2048;
const MAX_PATCH_VALUE_LENGTH = 512 * 1024;
const MAX_PATCH_KEYS = 80;
const CURSOR_MAX = 100;

export interface JoinPayload {
    projectId?: unknown;
    screenId?: unknown;
    collaborationMode?: unknown;
}

function parseCollaborationMode(v: unknown): 'shared' | 'exclusive' | undefined {
    if (v === 'exclusive') return 'exclusive';
    if (v === 'shared') return 'shared';
    return undefined;
}

/** Minimal `leave` payload: `{ projectId }`. */
export function validateLeavePayload(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as { projectId?: unknown };
    const projectId = typeof p.projectId === 'string' ? p.projectId.trim() : '';
    if (!projectId || projectId.length > MAX_STRING_LENGTH) return null;
    return projectId;
}

export function validateJoinPayload(
    payload: unknown
): { projectId: string; screenId?: string; collaborationMode?: 'shared' | 'exclusive' } | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as JoinPayload;
    const projectId = typeof p.projectId === 'string' ? p.projectId.trim() : '';
    if (!projectId || projectId.length > MAX_STRING_LENGTH) return null;
    const screenId =
        p.screenId !== undefined && p.screenId !== null && typeof p.screenId === 'string'
            ? p.screenId.trim().replace(/\/+$/, '').slice(0, MAX_STRING_LENGTH)
            : undefined;
    const collaborationMode = parseCollaborationMode(p.collaborationMode);
    return { projectId, screenId: screenId || undefined, collaborationMode };
}

export function validatePresenceUpdate(payload: unknown): PresenceUpdate | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const result: PresenceUpdate = {};

    if (p.screenId !== undefined && p.screenId !== null) {
        if (typeof p.screenId !== 'string') return null;
        result.screenId = p.screenId.trim().replace(/\/+$/, '').slice(0, MAX_STRING_LENGTH);
    }
    if (p.entryId !== undefined && p.entryId !== null) {
        if (typeof p.entryId !== 'string') return null;
        result.entryId = p.entryId.trim().slice(0, MAX_STRING_LENGTH);
    }
    if (Object.prototype.hasOwnProperty.call(p, 'collaborationMode')) {
        const m = parseCollaborationMode(p.collaborationMode);
        if (p.collaborationMode != null && m === undefined) return null;
        if (m !== undefined) result.collaborationMode = m;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'fieldPath')) {
        if (p.fieldPath === null || p.fieldPath === '') {
            result.fieldPath = undefined;
        } else if (typeof p.fieldPath === 'string') {
            const t = p.fieldPath.trim();
            if (t.length === 0) {
                result.fieldPath = undefined;
            } else {
                result.fieldPath = t.slice(0, MAX_STRING_LENGTH);
            }
        } else {
            return null;
        }
    }
    const OVERLAY_MAX = 128;
    if (Object.prototype.hasOwnProperty.call(p, 'overlayId')) {
        if (p.overlayId === null || p.overlayId === '') {
            result.overlayId = undefined;
        } else if (typeof p.overlayId === 'string') {
            const t = p.overlayId.trim().slice(0, OVERLAY_MAX);
            if (t.length === 0) {
                result.overlayId = undefined;
            } else if (/^[\w./:-]+$/i.test(t)) {
                result.overlayId = t;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
    if (p.typing !== undefined && p.typing !== null) {
        if (typeof p.typing !== 'boolean') return null;
        result.typing = p.typing;
    }
    if (p.textPreview !== undefined && p.textPreview !== null) {
        if (typeof p.textPreview !== 'string') return null;
        result.textPreview = p.textPreview.slice(0, MAX_STRING_LENGTH);
    }
    if (p.cursor !== undefined && p.cursor !== null) {
        if (typeof p.cursor === 'object' && p.cursor !== null) {
            const c = p.cursor as Record<string, unknown>;
            const parseAxis = (v: unknown): number | undefined => {
                if (typeof v === 'number' && Number.isFinite(v)) {
                    return Math.max(0, Math.min(CURSOR_MAX, v));
                }
                if (typeof v === 'string' && v.trim() !== '') {
                    const n = Number(v);
                    if (Number.isFinite(n)) return Math.max(0, Math.min(CURSOR_MAX, n));
                }
                return undefined;
            };
            const x = parseAxis(c.x);
            const y = parseAxis(c.y);
            if (x !== undefined || y !== undefined) {
                result.cursor = { x: x ?? 0, y: y ?? 0 };
            }
        }
    }
    if (Object.prototype.hasOwnProperty.call(p, 'pointerPulse')) {
        if (p.pointerPulse === null || p.pointerPulse === undefined) {
            result.pointerPulse = undefined;
        } else if (typeof p.pointerPulse === 'number' && Number.isFinite(p.pointerPulse)) {
            const t = Date.now();
            const v = Math.round(p.pointerPulse);
            // Allow small clock skew; drop out-of-range values without rejecting the whole update
            if (v > 0 && v >= t - 120_000 && v <= t + 60_000) {
                result.pointerPulse = v;
            }
        } else {
            return null;
        }
    }

    return Object.keys(result).length > 0 ? result : {};
}

/** Field and UI patch keys: word chars, colon (namespaced UI keys), path-like segments. */
const FIELD_KEY_PATTERN = /^[\w:./-]+$/;
const UI_KEY_PATTERN = FIELD_KEY_PATTERN;

function parsePatchRecord(
    raw: unknown,
    keyPattern: RegExp
): Record<string, string> | undefined | null {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out: Record<string, string> = {};
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > MAX_PATCH_KEYS) return null;
    for (const [k, v] of entries) {
        if (typeof k !== 'string') return null;
        const kt = k.trim().slice(0, MAX_STRING_LENGTH);
        if (!kt || !keyPattern.test(kt)) return null;
        if (typeof v !== 'string') return null;
        out[kt] = v.slice(0, MAX_PATCH_VALUE_LENGTH);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** Validated `screen:patch` payload. */
export function validateScreenPatch(payload: unknown): {
    screenId: string;
    fields?: Record<string, string>;
    ui?: Record<string, string>;
} | null {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    if (typeof p.screenId !== 'string') return null;
    const screenId = p.screenId.trim().replace(/\/+$/, '').slice(0, MAX_STRING_LENGTH);
    if (!screenId) return null;

    const fields = parsePatchRecord(p.fields, FIELD_KEY_PATTERN);
    const ui = parsePatchRecord(p.ui, UI_KEY_PATTERN);
    if (fields === null || ui === null) return null;
    if (!fields && !ui) return null;
    return { screenId, fields, ui };
}

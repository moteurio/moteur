/** Per-socket preference. Effective room mode is `exclusive` only if every connected peer uses `exclusive`. */
export type CollaborationMode = 'shared' | 'exclusive';

export interface Presence {
    userId: string;
    name: string;
    avatarUrl?: string;

    // Scope
    projectId: string;
    screenId?: string;

    /** Default `shared` when omitted. */
    collaborationMode?: CollaborationMode;

    // Detail
    entryId?: string;
    fieldPath?: string;
    /** Optional UI scope (e.g. open modal id) so collaborators see what you’re doing. */
    overlayId?: string;
    typing?: boolean;
    textPreview?: string;
    cursor?: { x: number; y: number };
    /** Client click timestamp (ms); cleared on the next update without `pointerPulse`. Ephemeral UI hint for followers. */
    pointerPulse?: number;

    // Metadata
    updatedAt: number;
}

export interface PresenceUpdate {
    screenId?: string;
    entryId?: string;
    fieldPath?: string;
    collaborationMode?: CollaborationMode;
    /** Clear with empty string; omit key to leave previous value. */
    overlayId?: string;
    typing?: boolean;
    textPreview?: string;
    cursor?: {
        x: number; // percentage [0–100]
        y: number;
    };
    /** Set on join from the user profile; not accepted from untrusted client payloads in the API layer. */
    avatarUrl?: string;
    /** Click / primary-button down: monotonic-ish ms (e.g. `Date.now()`); throttled on client. */
    pointerPulse?: number;
}

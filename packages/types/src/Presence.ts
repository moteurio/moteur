/** A per-socket preference. The effective room mode is `exclusive` only when every connected peer uses `exclusive`. */
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
    /** Optional UI scope, such as the ID of an open modal, so that collaborators can see what the user is doing. */
    overlayId?: string;
    typing?: boolean;
    textPreview?: string;
    cursor?: { x: number; y: number };
    /** Timestamp in milliseconds of the user's last click. Cleared by the next update that omits `pointerPulse`. A short-lived hint for users following this user. */
    pointerPulse?: number;

    // Metadata
    updatedAt: number;
}

export interface PresenceUpdate {
    screenId?: string;
    entryId?: string;
    fieldPath?: string;
    collaborationMode?: CollaborationMode;
    /** Send an empty string to clear it. Omit the key to keep the previous value. */
    overlayId?: string;
    typing?: boolean;
    textPreview?: string;
    cursor?: {
        x: number; // Percentage from 0 to 100
        y: number;
    };
    /** Set when the user joins, from their profile. The API layer ignores it in client payloads. */
    avatarUrl?: string;
    /** Timestamp in milliseconds (for example `Date.now()`) of a primary-button press. Clients throttle how often they send it. */
    pointerPulse?: number;
}

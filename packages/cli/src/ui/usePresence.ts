import { useState, useEffect, useRef } from 'react';

export interface PresenceUser {
    userId: string;
    name: string;
    screenId?: string;
    entryId?: string;
}

/** Map raw Socket.IO / server messages to user-friendly Presence error text. */
function presenceErrorMessage(raw: string | undefined | null): string {
    if (!raw || !raw.trim()) return 'Could not connect';
    const s = raw.trim().toLowerCase();
    if (
        s.includes('xhr poll error') ||
        s.includes('websocket error') ||
        s.includes('transport error')
    ) {
        return 'Server unreachable (check URL and that the API is running with Presence enabled)';
    }
    if (
        s.includes('unauthorized') ||
        s.includes('missing token') ||
        s.includes('invalid or expired token')
    ) {
        return 'Authentication failed — try logging in again';
    }
    if (s.includes('access denied') || s.includes('do not have access')) {
        return 'No access to this project';
    }
    if (s.includes('timeout') || s.includes('timed out')) {
        return 'Connection timed out';
    }
    return raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
}

/**
 * Connect to the Presence Socket.IO server and join a project room.
 * Returns the list of users currently in the project, connection status, and optional error message.
 */
export function usePresence(
    apiUrl: string | null,
    token: string | null,
    projectId: string | null,
    screenId?: string | null
): { users: PresenceUser[]; connected: boolean; error: string | null } {
    const [users, setUsers] = useState<PresenceUser[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<import('socket.io-client').Socket | null>(null);

    useEffect(() => {
        if (!apiUrl || !token || !projectId) {
            setUsers([]);
            setConnected(false);
            setError(null);
            return;
        }

        setError(null);
        let cancelled = false;
        const init = async () => {
            const { io } = await import('socket.io-client');
            if (cancelled) return;
            const baseUrl = apiUrl.replace(/\/+$/, '');
            const socket = io(baseUrl, {
                auth: { token },
                transports: ['polling', 'websocket'],
                path: '/socket.io'
            });
            socketRef.current = socket;

            socket.on('connect', () => {
                if (cancelled) return;
                setError(null);
                setConnected(true);
                socket.emit('join', { projectId, screenId: screenId ?? undefined });
            });

            socket.on('connect_error', (err: Error & { message?: string }) => {
                if (!cancelled) {
                    setConnected(false);
                    setError(presenceErrorMessage(err?.message));
                }
            });

            socket.on('disconnect', (reason: string) => {
                if (!cancelled) {
                    setConnected(false);
                    setUsers([]);
                    if (reason === 'io server disconnect' || reason === 'io client disconnect')
                        setError(null);
                }
            });

            socket.on('error', (payload: unknown) => {
                if (!cancelled) {
                    setConnected(false);
                    const msg =
                        payload && typeof payload === 'object' && 'message' in payload
                            ? String((payload as { message: string }).message)
                            : '';
                    setError(presenceErrorMessage(msg || 'Error'));
                }
            });

            socket.on(
                'presence:sync',
                (payload: {
                    users?: Array<{
                        userId: string;
                        name: string;
                        screenId?: string;
                        entryId?: string;
                    }>;
                }) => {
                    if (cancelled) return;
                    setUsers(
                        (payload?.users ?? []).map(u => ({
                            userId: u.userId,
                            name: u.name,
                            screenId: u.screenId,
                            entryId: u.entryId
                        }))
                    );
                }
            );

            socket.on(
                'presence:change',
                (payload: { userId?: string; changes?: Record<string, unknown> | null }) => {
                    const uid = payload?.userId;
                    if (cancelled || !uid) return;
                    if (payload.changes === null) {
                        setUsers(prev => prev.filter(u => u.userId !== uid));
                        return;
                    }
                    setUsers(prev => {
                        const idx = prev.findIndex(u => u.userId === uid);
                        const existing: PresenceUser =
                            idx >= 0 ? prev[idx] : { userId: uid, name: uid };
                        const updated: PresenceUser = {
                            userId: existing.userId,
                            name: existing.name,
                            screenId: (payload.changes?.screenId as string) ?? existing.screenId,
                            entryId: (payload.changes?.entryId as string) ?? existing.entryId
                        };
                        if (idx >= 0) {
                            const next = [...prev];
                            next[idx] = updated;
                            return next;
                        }
                        return [...prev, updated];
                    });
                }
            );
        };

        init();
        return () => {
            cancelled = true;
            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setConnected(false);
            setUsers([]);
            setError(null);
        };
    }, [apiUrl, token, projectId, screenId ?? '']);

    return { users, connected, error };
}

/**
 * Server-side presence tracing (stdout). All lines use prefix `[presence:debug]`.
 *
 * - Lock / room / pointer events log when they occur.
 * - High-frequency traces (`screen:patch` payloads, merged keys) only when `PRESENCE_DEBUG=1` (or `true` / `yes`).
 */
function envTruthy(name: string): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

export function isPresenceDebugVerbose(): boolean {
    return envTruthy('PRESENCE_DEBUG');
}

export function presenceDebug(action: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
        console.log('[presence:debug]', action, meta);
    } else {
        console.log('[presence:debug]', action);
    }
}

/** Logs only when `PRESENCE_DEBUG` is enabled (verbose `screen:patch` tracing). */
export function presenceDebugVerbose(action: string, meta?: Record<string, unknown>): void {
    if (!isPresenceDebugVerbose()) return;
    presenceDebug(action, meta);
}

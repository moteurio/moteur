/** Small helpers for showing values, used by declarations' tables and by every caller. */

/** `data.title.en` in a row. */
export function pathOf(row: unknown, dotted: string): unknown {
    return dotted
        .split('.')
        .reduce<unknown>(
            (at, k) =>
                at && typeof at === 'object' ? (at as Record<string, unknown>)[k] : undefined,
            row
        );
}

/** A value that may be a locale map, as one string (first non-empty language). */
export function localized(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (typeof value === 'object' && !Array.isArray(value)) {
        const first = Object.values(value as Record<string, unknown>).find(
            v => typeof v === 'string' && v
        );
        if (first) return String(first);
    }
    return JSON.stringify(value);
}

/**
 * An error as one sentence: the API's message without the client's "…: PlanLimitError: …" details
 * and stack, or the message of anything else.
 */
export function errorText(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const first = message
        .trim()
        .split('\n')[0]
        .split(/:\s*\w*Error:/)[0]
        .trim();
    const status = (error as { status?: number }).status;
    return first && first !== 'MoteurApiError'
        ? first
        : status
          ? `Request failed (HTTP ${status})`
          : 'Request failed';
}

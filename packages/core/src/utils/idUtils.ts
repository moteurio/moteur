export function isValidId(id: string): boolean {
    return /^[\w-]+$/.test(id);
}

/**
 * Returns the id if it is safe to use as a single path segment, which means letters, digits, `_`
 * and `-` only. Throws otherwise. Anything else (`..`, `/`, or an encoded slash that the router
 * decoded) could reach other files, so every place that builds a path calls this, regardless of
 * what the caller already checked.
 */
export function safeId(id: string): string {
    if (typeof id !== 'string' || !isValidId(id))
        throw Object.assign(new Error(`Invalid id: "${String(id).slice(0, 80)}"`), {
            statusCode: 400
        });
    return id;
}

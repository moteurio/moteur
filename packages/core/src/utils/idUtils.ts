export function isValidId(id: string): boolean {
    return /^[\w-]+$/.test(id);
}

/**
 * An id used as one path segment: letters, digits, `_` and `-` only. Anything else (`..`, `/`,
 * an encoded slash the router decoded) would reach other files, so it is refused wherever a
 * path is built, whatever the caller checked.
 */
export function safeId(id: string): string {
    if (typeof id !== 'string' || !isValidId(id))
        throw Object.assign(new Error(`Invalid id: "${String(id).slice(0, 80)}"`), {
            statusCode: 400
        });
    return id;
}

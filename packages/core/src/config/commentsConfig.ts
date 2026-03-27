import process from 'node:process';

const DEFAULT_MAX_BODY_LENGTH = 10000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (value === undefined || value === '') return fallback;
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return n;
}

/**
 * Comments-related configuration.
 * Env: COMMENTS_MAX_BODY_LENGTH — max allowed character length for comment body (default 10000).
 */
export const commentsConfig = {
    /** Maximum character length for a comment body. */
    get maxBodyLength(): number {
        return parsePositiveInt(process.env.COMMENTS_MAX_BODY_LENGTH, DEFAULT_MAX_BODY_LENGTH);
    }
};

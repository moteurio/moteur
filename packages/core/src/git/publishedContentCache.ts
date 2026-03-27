/**
 * In-memory LRU cache for published entry content retrieved via `git show`.
 *
 * Cache keys are `${commitHash}:${relativePath}` — immutable by nature of git,
 * so entries never need invalidation. The cache is populated:
 *   - Write-through in publishEntry() (instant reads after publish)
 *   - Read-through in getPublishedEntryForProject() (lazy fill on cold start)
 */

const DEFAULT_MAX_SIZE = 500;

let maxSize = DEFAULT_MAX_SIZE;
const cache = new Map<string, string>();

function cacheKey(commitHash: string, relativePath: string): string {
    return `${commitHash}:${relativePath}`;
}

/**
 * Get cached raw JSON string for the given commit + path.
 * Returns undefined on cache miss.
 * Promotes the entry to "most recently used" on hit.
 */
export function get(commitHash: string, relativePath: string): string | undefined {
    const key = cacheKey(commitHash, relativePath);
    const value = cache.get(key);
    if (value === undefined) return undefined;

    // Move to end (most recently used) so LRU eviction works
    cache.delete(key);
    cache.set(key, value);
    return value;
}

/**
 * Store raw JSON string for the given commit + path.
 * Evicts the least-recently-used entry if the cache is full.
 */
export function set(commitHash: string, relativePath: string, rawJson: string): void {
    const key = cacheKey(commitHash, relativePath);

    // If key already exists, delete first so it moves to end
    if (cache.has(key)) {
        cache.delete(key);
    } else if (cache.size >= maxSize) {
        // Evict the oldest entry (first key in Map iteration order)
        const oldest = cache.keys().next().value;
        if (oldest != null) cache.delete(oldest);
    }

    cache.set(key, rawJson);
}

/** Number of entries currently cached. */
export function size(): number {
    return cache.size;
}

/** Clear the entire cache (e.g. for tests). */
export function clear(): void {
    cache.clear();
}

/** Reconfigure max cache size. Evicts excess entries if shrinking. */
export function configure(opts: { maxSize?: number }): void {
    if (opts.maxSize != null && opts.maxSize > 0) {
        maxSize = opts.maxSize;
        while (cache.size > maxSize) {
            const oldest = cache.keys().next().value;
            if (oldest != null) cache.delete(oldest);
        }
    }
}

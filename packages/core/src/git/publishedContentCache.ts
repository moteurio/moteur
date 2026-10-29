import { cacheShare } from '../utils/cacheBudget.js';

/**
 * In-memory LRU cache for published entry content retrieved via `git show`.
 *
 * Cache keys are `${commitHash}:${relativePath}` — immutable by nature of git,
 * so entries never need invalidation. The cache is populated:
 *   - Write-through in publishEntry() (instant reads after publish)
 *   - Read-through in getPublishedEntryForProject() (lazy fill on cold start)
 */

/**
 * Every published page and entry a server's sites read, as text: thousands of items across
 * projects, so the bound is the memory they take (its share of the cache budget, see
 * utils/cacheBudget.ts), with a count as well.
 */
const DEFAULT_MAX_SIZE = 200_000;

let maxSize = DEFAULT_MAX_SIZE;
let maxBytes: number | undefined;
const byteLimit = () => maxBytes ?? cacheShare('published');
let bytes = 0;
const cache = new Map<string, string>();

function evictOldest(): void {
    const oldest = cache.keys().next().value;
    if (oldest == null) return;
    bytes -= cache.get(oldest)!.length;
    cache.delete(oldest);
}

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
    const old = cache.get(key);
    if (old !== undefined) {
        bytes -= old.length;
        cache.delete(key);
    }
    cache.set(key, rawJson);
    bytes += rawJson.length;
    // The oldest go first (Map iteration order) until both bounds hold.
    while (cache.size > maxSize || (bytes > byteLimit() && cache.size > 1)) evictOldest();
}

/** Number of entries currently cached. */
export function size(): number {
    return cache.size;
}

/** Clear the entire cache (e.g. for tests). */
export function clear(): void {
    cache.clear();
    bytes = 0;
}

/** Reconfigure max cache size. Evicts excess entries if shrinking. */
export function configure(opts: { maxSize?: number; maxBytes?: number }): void {
    if (opts.maxSize != null && opts.maxSize > 0) maxSize = opts.maxSize;
    if (opts.maxBytes != null && opts.maxBytes > 0) maxBytes = opts.maxBytes;
    while (cache.size > maxSize || (bytes > byteLimit() && cache.size > 1)) evictOldest();
}

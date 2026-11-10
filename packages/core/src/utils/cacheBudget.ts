import v8 from 'node:v8';

/**
 * The total memory Moteur's caches may use together. By default this is a fifth of the JavaScript
 * heap limit of the process, and `MOTEUR_CACHE_MB` overrides it. Basing it on the heap lets the
 * caches fit on a small machine and grow on a large one. Larger caches would not pay off, because
 * garbage collection would cost more than the caches save.
 */
export function cacheBudgetBytes(): number {
    const set = Number(process.env.MOTEUR_CACHE_MB);
    if (Number.isFinite(set) && set > 0) return set * 1024 * 1024;
    return Math.floor(v8.getHeapStatistics().heap_size_limit / 5);
}

/**
 * The number of bytes of ready-to-send images (resized on request) to keep in memory. By default
 * this is an eighth of the heap limit, and `MOTEUR_IMAGE_CACHE_MB` overrides it. The image bytes
 * live outside the heap, so they do not count against the caches' budget, but they do count toward
 * the memory of the process.
 */
export function imageCacheBytes(): number {
    const raw = process.env.MOTEUR_IMAGE_CACHE_MB;
    const set = Number(raw);
    if (raw && Number.isFinite(set) && set >= 0) return set * 1024 * 1024;
    return Math.floor(v8.getHeapStatistics().heap_size_limit / 8);
}

/** The fraction of the cache budget each cache gets. */
export const CACHE_SHARES = { answers: 0.3, files: 0.25, published: 0.45 } as const;

export function cacheShare(name: keyof typeof CACHE_SHARES): number {
    return Math.floor(cacheBudgetBytes() * CACHE_SHARES[name]);
}

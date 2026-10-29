import v8 from 'node:v8';

/**
 * How much memory Moteur's caches may take together: a fifth of the JavaScript heap this process
 * may use (`MOTEUR_CACHE_MB` sets it outright). Sized from the heap, the caches fit a small
 * machine and grow on a large one; past the heap, garbage collection would cost more than the
 * caches save.
 */
export function cacheBudgetBytes(): number {
    const set = Number(process.env.MOTEUR_CACHE_MB);
    if (Number.isFinite(set) && set > 0) return set * 1024 * 1024;
    return Math.floor(v8.getHeapStatistics().heap_size_limit / 5);
}

/**
 * Bytes of images kept in memory, ready to send (sizes made on request): an eighth of the heap
 * limit (`MOTEUR_IMAGE_CACHE_MB` sets it outright). Their bytes live outside the heap, so they
 * don't take from the caches' budget, but they do count in the process's memory.
 */
export function imageCacheBytes(): number {
    const raw = process.env.MOTEUR_IMAGE_CACHE_MB;
    const set = Number(raw);
    if (raw && Number.isFinite(set) && set >= 0) return set * 1024 * 1024;
    return Math.floor(v8.getHeapStatistics().heap_size_limit / 8);
}

/** Each cache's part of the budget. */
export const CACHE_SHARES = { answers: 0.3, files: 0.25, published: 0.45 } as const;

export function cacheShare(name: keyof typeof CACHE_SHARES): number {
    return Math.floor(cacheBudgetBytes() * CACHE_SHARES[name]);
}

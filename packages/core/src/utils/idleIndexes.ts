/**
 * Projects' SQLite indexes (content, assets) are opened on first use and closed after a period
 * without use. A server with thousands of projects therefore keeps open only the indexes that its
 * sites and editors are using, each with a small page cache. Reopening an index takes a few
 * milliseconds. An index with queued work (`pending`) is never closed, and neither is one used in
 * the last few seconds, so work in progress never loses its database.
 */

/** Usage that an open index records: when it was last used and how much work is pending. */
export type Usage = { used: number; pending: number };

/** How long an index may stay unused before it is closed, in ms. `MOTEUR_INDEX_IDLE_SECONDS` sets it (default 15 seconds). */
export function idleMs(): number {
    const n = Number(process.env.MOTEUR_INDEX_IDLE_SECONDS);
    return (Number.isFinite(n) && n > 0 ? n : 15) * 1000;
}

/** SQLite pragmas for each connection. They limit the page cache to 1 MiB (the default is about 2 MB) and disable memory mapping. */
export const INDEX_PRAGMAS = 'PRAGMA cache_size = -1024; PRAGMA mmap_size = 0;';

/** Counts a piece of work on an index as pending while it runs. */
export function busy<T>(usage: Usage, run: Promise<T>): Promise<T> {
    usage.pending++;
    const done = () => {
        usage.pending--;
        usage.used = Date.now();
    };
    run.then(done, done);
    return run;
}

/** Periodically closes the indexes that have been unused for longer than `idleMs`. It checks every half of `idleMs`, at most every 30 seconds. */
export function closeWhenIdle(open: Map<string, Usage>, close: (key: string) => void): void {
    const timer = setInterval(
        () => {
            const before = Date.now() - idleMs();
            for (const [key, usage] of open)
                if (usage.pending === 0 && usage.used < before) close(key);
        },
        Math.min(30_000, Math.max(1_000, idleMs() / 2))
    );
    timer.unref?.();
}

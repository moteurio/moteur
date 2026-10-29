/**
 * Projects' SQLite indexes (content, assets) are opened on first use and closed after a while
 * unused: a server with thousands of projects keeps open only those its sites and editors are
 * using, each with a small page cache. Reopening one costs a few milliseconds. An index with work
 * queued (`pending`) is never closed, and one used in the last few seconds isn't either, so nothing in
 * progress loses its database.
 */

/** What an open index records for this. */
export type Usage = { used: number; pending: number };

/** Closed after this long unused (`MOTEUR_INDEX_IDLE_SECONDS`, 15). */
export function idleMs(): number {
    const n = Number(process.env.MOTEUR_INDEX_IDLE_SECONDS);
    return (Number.isFinite(n) && n > 0 ? n : 15) * 1000;
}

/** Per connection: SQLite's page cache, in KiB (its default is about 2 MB). */
export const INDEX_PRAGMAS = 'PRAGMA cache_size = -1024; PRAGMA mmap_size = 0;';

/** Count a piece of work on an index while it runs. */
export function busy<T>(usage: Usage, run: Promise<T>): Promise<T> {
    usage.pending++;
    const done = () => {
        usage.pending--;
        usage.used = Date.now();
    };
    run.then(done, done);
    return run;
}

/** Close, every half `idleMs` (half a minute at most), the indexes unused for longer than it. */
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

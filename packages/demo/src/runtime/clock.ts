/**
 * A simulated clock. The demo's history (created, edited, published, reviewed and commented) is
 * spread over the weeks before the build instead of happening in one second, so lists sort
 * meaningfully and the git history looks like a real project's.
 *
 * Core stamps audit fields with `new Date()` and takes git commit dates from the process
 * environment, so the clock patches the global Date and sets GIT_AUTHOR_DATE and GIT_COMMITTER_DATE.
 */

const RealDate = Date;
let offsetMs = 0;
let installed = false;

const DAY = 24 * 60 * 60 * 1000;

function realNow(): number {
    return RealDate.now();
}

export function now(): number {
    return realNow() + offsetMs;
}

function syncGitEnv(): void {
    const iso = new RealDate(now()).toISOString();
    process.env.GIT_AUTHOR_DATE = iso;
    process.env.GIT_COMMITTER_DATE = iso;
}

/** Replaces the global Date with one that follows the simulated clock. */
export function installClock(): void {
    if (installed) return;
    installed = true;
    class SimulatedDate extends RealDate {
        constructor(...args: unknown[]) {
            if (args.length === 0) super(now());
            else super(...(args as [string | number | Date]));
        }
        static now(): number {
            return now();
        }
    }
    globalThis.Date = SimulatedDate as DateConstructor;
    syncGitEnv();
}

/** Restores real time, at the end of a build or in tests. */
export function uninstallClock(): void {
    if (!installed) return;
    globalThis.Date = RealDate;
    offsetMs = 0;
    delete process.env.GIT_AUTHOR_DATE;
    delete process.env.GIT_COMMITTER_DATE;
    installed = false;
}

/** Sets the clock to `daysAgo` days before the real current time. Fractions are allowed. */
export function setDaysAgo(daysAgo: number): void {
    offsetMs = -Math.round(daysAgo * DAY);
    syncGitEnv();
}

/** Moves the clock forward by a few minutes, so that consecutive actions get distinct times. */
export function tick(minutes = 7): void {
    offsetMs += minutes * 60 * 1000;
    if (offsetMs > 0) offsetMs = 0;
    syncGitEnv();
}

/** Returns the clock to the real present. Schedules must be created in real time to be valid. */
export function present(): void {
    offsetMs = 0;
    syncGitEnv();
}

/** Returns an ISO timestamp `days` from the real present. A negative value is in the past. */
export function isoInDays(days: number, hour = 9): string {
    const d = new RealDate(realNow() + days * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
}

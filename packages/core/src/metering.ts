import fs from 'fs';
import path from 'path';
import { writeJsonAtomic } from './utils/fileUtils.js';

/**
 * Metering: API requests and AI credits, per project and per calendar month (UTC).
 *
 * Credits are spent against a monthly allowance that the host decides (a billing plugin sets it
 * per plan with `setCreditAllowance`; otherwise `MOTEUR_AI_MONTHLY_CREDITS`, default 1000, or
 * `unlimited`). `MOTEUR_AI_CREDITS_DISABLED=1` makes every project unlimited. Every spend and grant
 * is a ledger entry, so a balance can always be explained.
 *
 * The store is swappable (`setMeteringStore`): in memory by default, files under
 * `data/metering` when the API server starts (`createFileMeteringStore`), or a database from a
 * host plugin for several API instances.
 */

/** `submission`: a form submission received (honeypot catches left out). */
export type RequestKind = 'public' | 'studio' | 'submission';

export type CreditEntry = {
    at: string;
    projectId: string;
    /** `YYYY-MM`, the month the entry counts against. */
    period: string;
    /** `spend` uses credits; `grant` adds to this month's allowance (negative to take back). */
    type: 'spend' | 'grant';
    amount: number;
    reason?: string;
    userId?: string;
};

export type RequestTotals = {
    /** Studio-scoped requests not tied to a project. */
    studio: number;
    projects: Record<
        string,
        { publicRequests: number; studioRequests: number; submissions?: number }
    >;
};

export interface MeteringStore {
    recordRequests(
        period: string,
        projectId: string | null,
        kind: RequestKind,
        count: number
    ): void;
    requestTotals(period: string): RequestTotals;
    /** One project's public requests in `period`; asked on every public request, so keep it cheap. */
    publicRequests?(period: string, projectId: string): number;
    appendCredits(entry: CreditEntry): void;
    creditTotals(projectId: string, period: string): { used: number; granted: number };
    creditEntries(projectId: string, period: string): CreditEntry[];
    /** Write anything buffered (on shutdown). */
    flush(): void;
}

/** `YYYY-MM` in UTC. */
export function currentPeriod(now: Date = new Date()): string {
    return now.toISOString().slice(0, 7);
}

export function periodBounds(period: string): { start: string; end: string } {
    const [y, m] = period.split('-').map(Number);
    return {
        start: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
        end: new Date(Date.UTC(y, m, 1)).toISOString()
    };
}

/** The `count` months up to and including `period`, oldest first. */
export function recentPeriods(count: number, period = currentPeriod()): string[] {
    const [y, m] = period.split('-').map(Number);
    return Array.from({ length: count }, (_, i) =>
        currentPeriod(new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1)))
    );
}

function emptyTotals(): RequestTotals {
    return { studio: 0, projects: {} };
}

function addRequest(totals: RequestTotals, projectId: string | null, kind: RequestKind, n: number) {
    if (!projectId) {
        if (kind === 'studio') totals.studio += n;
        return;
    }
    const row = (totals.projects[projectId] ??= { publicRequests: 0, studioRequests: 0 });
    if (kind === 'public') row.publicRequests += n;
    else if (kind === 'submission') row.submissions = (row.submissions ?? 0) + n;
    else row.studioRequests += n;
}

function sumCredits(entries: CreditEntry[]): { used: number; granted: number } {
    let used = 0;
    let granted = 0;
    for (const e of entries) {
        if (e.type === 'spend') used += e.amount;
        else granted += e.amount;
    }
    return { used, granted };
}

function cloneTotals(t: RequestTotals): RequestTotals {
    return {
        studio: t.studio,
        projects: Object.fromEntries(Object.entries(t.projects).map(([k, v]) => [k, { ...v }]))
    };
}

/** Lost on restart; for tests and the CLI. */
export function createMemoryMeteringStore(): MeteringStore {
    const requests = new Map<string, RequestTotals>();
    const credits: CreditEntry[] = [];
    const entriesOf = (projectId: string, period: string) =>
        credits.filter(e => e.projectId === projectId && e.period === period);
    return {
        recordRequests(period, projectId, kind, count) {
            if (!requests.has(period)) requests.set(period, emptyTotals());
            addRequest(requests.get(period)!, projectId, kind, count);
        },
        requestTotals: period => cloneTotals(requests.get(period) ?? emptyTotals()),
        publicRequests: (period, projectId) =>
            requests.get(period)?.projects[projectId]?.publicRequests ?? 0,
        appendCredits(entry) {
            credits.push(entry);
        },
        creditTotals: (projectId, period) => sumCredits(entriesOf(projectId, period)),
        creditEntries: entriesOf,
        flush() {}
    };
}

/**
 * Files in `dir`: `credits-YYYY-MM.jsonl`, appended on every spend or grant (never lost), and
 * `requests-YYYY-MM.json`, counted in memory and written every `flushMs` and on `flush()`.
 * One API process per directory: several would overwrite each other's request counts.
 */
export function createFileMeteringStore(dir: string, flushMs = 5000): MeteringStore {
    fs.mkdirSync(dir, { recursive: true });
    const requests = new Map<string, RequestTotals>();
    const dirty = new Set<string>();
    const credits = new Map<string, CreditEntry[]>();

    const requestsFile = (period: string) => path.join(dir, `requests-${period}.json`);
    const creditsFile = (period: string) => path.join(dir, `credits-${period}.jsonl`);

    function loadRequests(period: string): RequestTotals {
        let totals = requests.get(period);
        if (totals) return totals;
        try {
            const raw = JSON.parse(fs.readFileSync(requestsFile(period), 'utf-8'));
            totals = { studio: Number(raw.studio) || 0, projects: raw.projects ?? {} };
        } catch {
            totals = emptyTotals();
        }
        requests.set(period, totals);
        return totals;
    }

    function loadCredits(period: string): CreditEntry[] {
        let entries = credits.get(period);
        if (entries) return entries;
        entries = [];
        try {
            for (const line of fs.readFileSync(creditsFile(period), 'utf-8').split('\n')) {
                if (!line.trim()) continue;
                try {
                    entries.push(JSON.parse(line));
                } catch {
                    console.warn(`[metering] Skipping a damaged line in ${creditsFile(period)}`);
                }
            }
        } catch {
            // No entries yet this month.
        }
        credits.set(period, entries);
        return entries;
    }

    function flush() {
        for (const period of dirty) {
            try {
                writeJsonAtomic(requestsFile(period), requests.get(period));
            } catch (err) {
                console.error('[metering] Could not save request counts:', (err as Error).message);
                continue;
            }
            dirty.delete(period);
        }
        // Months that ended stay on disk; keep only this month in memory.
        const now = currentPeriod();
        for (const period of requests.keys()) {
            if (period !== now && !dirty.has(period)) requests.delete(period);
        }
    }

    const timer = setInterval(flush, flushMs);
    timer.unref?.();

    return {
        recordRequests(period, projectId, kind, count) {
            addRequest(loadRequests(period), projectId, kind, count);
            dirty.add(period);
        },
        requestTotals: period => cloneTotals(loadRequests(period)),
        publicRequests: (period, projectId) =>
            loadRequests(period).projects[projectId]?.publicRequests ?? 0,
        appendCredits(entry) {
            fs.appendFileSync(creditsFile(entry.period), `${JSON.stringify(entry)}\n`);
            loadCredits(entry.period).push(entry);
        },
        creditTotals: (projectId, period) =>
            sumCredits(loadCredits(period).filter(e => e.projectId === projectId)),
        creditEntries: (projectId, period) =>
            loadCredits(period).filter(e => e.projectId === projectId),
        flush
    };
}

let store: MeteringStore = createMemoryMeteringStore();

export function setMeteringStore(next: MeteringStore): void {
    store.flush();
    store = next;
}

export function getMeteringStore(): MeteringStore {
    return store;
}

export function recordRequest(kind: RequestKind, projectId?: string | null): void {
    store.recordRequests(currentPeriod(), projectId ?? null, kind, 1);
}

/** A project's public API requests this month (or in `period`). */
export function publicRequestCount(projectId: string, period = currentPeriod()): number {
    return store.publicRequests
        ? store.publicRequests(period, projectId)
        : (store.requestTotals(period).projects[projectId]?.publicRequests ?? 0);
}

/** Form submissions a project received this month (or in `period`). */
export function submissionCount(projectId: string, period = currentPeriod()): number {
    return store.requestTotals(period).projects[projectId]?.submissions ?? 0;
}

// --- Credits ---

/** Credits a project gets each month; null means unlimited. */
export type CreditAllowance = (projectId: string) => number | null;

const DEFAULT_MONTHLY_CREDITS = 1000;

function creditsOff(): boolean {
    const off = (process.env.MOTEUR_AI_CREDITS_DISABLED ?? '').trim().toLowerCase();
    return off === '1' || off === 'true' || off === 'yes';
}

function envAllowance(): number | null {
    const raw = process.env.MOTEUR_AI_MONTHLY_CREDITS?.trim();
    if (!raw) return DEFAULT_MONTHLY_CREDITS;
    if (raw.toLowerCase() === 'unlimited') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MONTHLY_CREDITS;
}

let allowance: CreditAllowance = () => envAllowance();

/** Who decides each project's monthly credits (e.g. a billing plugin, from the plan). */
export function setCreditAllowance(next: CreditAllowance | null): void {
    allowance = next ?? (() => envAllowance());
}

export type CreditBalance = {
    period: string;
    /** Monthly allowance; null when unlimited. */
    allowance: number | null;
    granted: number;
    used: number;
    /** null when unlimited. */
    remaining: number | null;
};

export function creditBalance(projectId: string, period = currentPeriod()): CreditBalance {
    const monthly = creditsOff() ? null : allowance(projectId);
    const { used, granted } = store.creditTotals(projectId, period);
    return {
        period,
        allowance: monthly,
        granted,
        used,
        remaining: monthly === null ? null : Math.max(0, monthly + granted - used)
    };
}

/** Spend credits if the project has enough; nothing is recorded otherwise. */
export function spendCredits(
    projectId: string,
    amount: number,
    detail: { reason?: string; userId?: string } = {}
): { success: boolean; remaining: number | null } {
    const before = creditBalance(projectId);
    if (amount <= 0) return { success: true, remaining: before.remaining };
    if (before.remaining !== null && before.remaining < amount) {
        return { success: false, remaining: before.remaining };
    }
    store.appendCredits({
        at: new Date().toISOString(),
        projectId,
        period: before.period,
        type: 'spend',
        amount,
        ...detail
    });
    return {
        success: true,
        remaining: before.remaining === null ? null : before.remaining - amount
    };
}

/** Add credits to this month (a top-up, a goodwill gesture); negative takes some back. */
export function grantCredits(
    projectId: string,
    amount: number,
    detail: { reason?: string; userId?: string } = {}
): CreditBalance {
    if (amount !== 0) {
        store.appendCredits({
            at: new Date().toISOString(),
            projectId,
            period: currentPeriod(),
            type: 'grant',
            amount,
            ...detail
        });
    }
    return creditBalance(projectId);
}

import { cacheShare } from './utils/cacheBudget.js';

/**
 * Caches the responses to site reads per project, until the project changes. Every change
 * Moteur makes emits an event on the event bus, and any event about a project increments that
 * project's version (`touchProject`). A response is cached under the version at which its request
 * started, so no cached response outlives a change. Changes that emit no event (a file edited by
 * hand, a branch switch) are covered by a short expiry (`MOTEUR_DELIVERY_CACHE_SECONDS`, default
 * 5; 0 disables the cache). Only responses that are identical for every site reader belong here:
 * published content read with an API key, never previews or signed-in members.
 */

type Answer = { body: string; headers: Record<string, string>; at: number };
const answers = new Map<string, Answer>();
let bytes = 0;
const versions = new Map<string, number>();

/**
 * Paths that never reach a site, so writing them leaves cached answers valid: visitor
 * submissions (user-data/), project state (.moteur/: comments, reviews, notifications) and
 * preview links. Any path not listed counts as a change, so a mistake here only costs cache
 * hits and never serves stale content.
 */
const NOT_DELIVERED = ['user-data/', '.moteur/', 'preview-tokens'];

/** Whether writing this project file can change what its sites are sent. */
export function reachesSites(key: string): boolean {
    const k = key.replace(/\\/g, '/');
    return !NOT_DELIVERED.some(prefix => k === prefix || k.startsWith(prefix));
}

/** Events about a project that never change what its sites are sent (see `reachesSites`). */
const QUIET_EVENTS = new Set([
    'activity.logged',
    'comment.added',
    'comment.resolved',
    'comment.deleted',
    'comment.edited',
    'form.submitted',
    'form.submission.beforeDelete',
    'form.submission.afterDelete',
    'schedule.afterCreate',
    'schedule.afterCancel',
    'schedule.afterDelete',
    'schedule.failed'
]);

/** Whether an event can change what a project's sites are sent. */
export function eventReachesSites(eventName: string): boolean {
    return !QUIET_EVENTS.has(eventName);
}

/** Marks the project as changed, which invalidates its cached answers. */
export function touchProject(projectId: string): void {
    versions.set(projectId, (versions.get(projectId) ?? 0) + 1);
}

/** The project's current version. Cached answers are stored and looked up under it. */
export function projectVersion(projectId: string): number {
    return versions.get(projectId) ?? 0;
}

function maxAgeMs(): number {
    const raw = process.env.MOTEUR_DELIVERY_CACHE_SECONDS;
    const n = raw === undefined || raw === '' ? 5 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n * 1000 : 0;
}

export function deliveryCacheEnabled(): boolean {
    return maxAgeMs() > 0;
}

const keyOf = (projectId: string, version: number, request: string) =>
    `${projectId}\0${version}\0${request}`;

/** The cached answer for this request at this version, if it has not expired. */
export function cachedAnswer(
    projectId: string,
    version: number,
    request: string
): Answer | undefined {
    const key = keyOf(projectId, version, request);
    const found = answers.get(key);
    if (!found) return undefined;
    if (Date.now() - found.at > maxAgeMs() || version !== projectVersion(projectId)) {
        answers.delete(key);
        bytes -= found.body.length;
        return undefined;
    }
    return found;
}

/** Caches an answer under the project version at which its request started. */
export function keepAnswer(
    projectId: string,
    version: number,
    request: string,
    body: string,
    headers: Record<string, string>
): void {
    // The project changed while this answer was computed, so do not cache it.
    if (version !== projectVersion(projectId) || body.length > 4 * 1024 * 1024) return;
    const key = keyOf(projectId, version, request);
    const old = answers.get(key);
    if (old) bytes -= old.body.length;
    answers.delete(key);
    answers.set(key, { body, headers, at: Date.now() });
    bytes += body.length;
    for (const [k, a] of answers) {
        if (bytes <= cacheShare('answers')) break;
        answers.delete(k);
        bytes -= a.body.length;
    }
}

const derived = new Map<string, { version: number; at: number; value: Promise<unknown> }>();

/**
 * Caches values that every read of a project computes identically (its pages and their URLs, its
 * schemas), on the same terms as responses: until the project changes, and at most for the
 * expiry time. The cached value is shared, so callers must treat it as read-only.
 */
export function perVersion<T>(
    projectId: string,
    name: string,
    compute: () => Promise<T>
): Promise<T> {
    if (!deliveryCacheEnabled()) return compute();
    const key = `${projectId}\0${name}`;
    const version = projectVersion(projectId);
    const kept = derived.get(key);
    if (kept && kept.version === version && Date.now() - kept.at <= maxAgeMs())
        return kept.value as Promise<T>;
    const value = compute();
    derived.set(key, { version, at: Date.now(), value });
    // Do not cache a failure, so the next read retries.
    value.catch(() => {
        if (derived.get(key)?.value === value) derived.delete(key);
    });
    return value;
}

// Entries past the age limit would be recomputed anyway, so evict them. This keeps memory
// proportional to the projects currently being read, not every project ever read.
const sweeper = setInterval(() => {
    const before = Date.now() - maxAgeMs();
    for (const [key, kept] of derived) if (kept.at < before) derived.delete(key);
    for (const [key, answer] of answers)
        if (answer.at < before) {
            answers.delete(key);
            bytes -= answer.body.length;
        }
}, 30_000);
sweeper.unref?.();

/** Clears every cached answer. For tests. */
export function clearDeliveryCache(): void {
    answers.clear();
    derived.clear();
    bytes = 0;
}

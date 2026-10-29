import { cacheShare } from './utils/cacheBudget.js';

/**
 * Answers to sites' reads, kept per project until the project changes. Every change Moteur makes
 * announces itself on the event bus, and any event about a project moves that project on a
 * version (`touchProject`); an answer is kept under the version its request started on, so
 * none outlives a change. What could change without an event (a file edited by hand, a branch
 * switched) is covered by a short age limit (`MOTEUR_DELIVERY_CACHE_SECONDS`, 5 s; 0 turns the
 * cache off). Only answers the same for every site reader belong here: published content read
 * with an API key, never previews or signed-in members.
 */

type Answer = { body: string; headers: Record<string, string>; at: number };
const answers = new Map<string, Answer>();
let bytes = 0;
const versions = new Map<string, number>();

/**
 * What never reaches a site, so changing it keeps the kept answers: visitors' submissions
 * (user-data/), the workspace (.moteur/: comments, reviews, notifications) and preview links.
 * Anything not listed counts as a change: a mistake here costs kept answers, never fresh ones.
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

/** The project changed: its kept answers no longer count. */
export function touchProject(projectId: string): void {
    versions.set(projectId, (versions.get(projectId) ?? 0) + 1);
}

/** The project's version now: an answer is kept and looked up under it. */
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

/** The kept answer to this request at this version, if it's still young enough. */
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

/** Keep an answer, under the version its request started on. */
export function keepAnswer(
    projectId: string,
    version: number,
    request: string,
    body: string,
    headers: Record<string, string>
): void {
    // Changed meanwhile: an answer read across a change isn't kept.
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
 * What every read of a project works out the same way (its pages and their addresses, its
 * schemas), kept on the same terms as answers: until the project changes, at most the age
 * limit. The value is shared, so it must be read, never changed.
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
    // A failure isn't kept: the next read tries again.
    value.catch(() => {
        if (derived.get(key)?.value === value) derived.delete(key);
    });
    return value;
}

// What's past the age limit would be worked out again anyway: let it go, so memory follows the
// projects being read now, not every project ever read.
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

/** Forget every kept answer (tests). */
export function clearDeliveryCache(): void {
    answers.clear();
    derived.clear();
    bytes = 0;
}

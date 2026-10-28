/**
 * Answers to sites' reads, kept per project until the project changes. Every change Moteur makes
 * announces itself on the event bus, and any event about a project moves that project on a
 * version (`touchProject`); an answer is kept under the version its request started on, so
 * none outlives a change. What could change without an event (a file edited by hand, a branch
 * switched) is covered by a short age limit (`MOTEUR_DELIVERY_CACHE_SECONDS`, 5 s; 0 turns the
 * cache off). Only answers the same for every site reader belong here: published content read
 * with an API key, never previews or signed-in members.
 */

const MAX_BYTES = 64 * 1024 * 1024;

type Answer = { body: string; headers: Record<string, string>; at: number };
const answers = new Map<string, Answer>();
let bytes = 0;
const versions = new Map<string, number>();

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
        if (bytes <= MAX_BYTES) break;
        answers.delete(k);
        bytes -= a.body.length;
    }
}

/** Forget every kept answer (tests). */
export function clearDeliveryCache(): void {
    answers.clear();
    bytes = 0;
}

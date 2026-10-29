/**
 * Limits a host puts on a project (api.moteur.io's plans). Moteur on its own has none: until a
 * plugin sets a resolver, every check passes.
 */

/** A limit for one project; null for no limit. */
export type ProjectLimit = (projectId: string) => number | null;

/**
 * Whether someone may start another project: refused once `taken` reaches `max` (null: no
 * limit). What counts is the host's to say (api.moteur.io: their projects waiting for a plan).
 */
export type ProjectsLimit = (userId: string) => { taken: number; max: number } | null;

/** Things a plan may cap how many a project has. */
export const COUNT_KINDS = [
    'channels',
    'models',
    'entries',
    'forms',
    'structures',
    'blocks',
    'templates',
    'pages'
] as const;
export type CountKind = (typeof COUNT_KINDS)[number];

/** How many of a kind a project may have; null for no limit. */
export type CountLimit = (projectId: string, kind: CountKind) => number | null;

export type PlanLimitKind =
    'people' | 'storage' | 'requests' | 'imageTraffic' | 'submissions' | 'projects' | CountKind;

let peopleLimit: ProjectLimit | null = null;
let storageLimit: ProjectLimit | null = null;
let requestQuota: ProjectLimit | null = null;
let imageTrafficQuota: ProjectLimit | null = null;
let submissionQuota: ProjectLimit | null = null;
let projectsLimit: ProjectsLimit | null = null;
let countLimit: CountLimit | null = null;

/** Set (or clear, with null) where the people limit comes from. */
export function setPeopleLimit(fn: ProjectLimit | null): void {
    peopleLimit = fn;
}

/** Set (or clear) the bytes of files a project may store. */
export function setStorageLimit(fn: ProjectLimit | null): void {
    storageLimit = fn;
}

/** Set (or clear) the public API requests a project may answer each calendar month (UTC). */
export function setRequestQuota(fn: ProjectLimit | null): void {
    requestQuota = fn;
}

/**
 * Set (or clear) the bytes of images a project may send each calendar month (UTC): originals and
 * sizes, and the other files stored with them, as sites and browsers download them.
 */
export function setImageTrafficQuota(fn: ProjectLimit | null): void {
    imageTrafficQuota = fn;
}

/** Set (or clear) the form submissions a project may receive each calendar month (UTC). */
export function setSubmissionQuota(fn: ProjectLimit | null): void {
    submissionQuota = fn;
}

/** Set (or clear) how many projects a person may start. */
export function setProjectsLimit(fn: ProjectsLimit | null): void {
    projectsLimit = fn;
}

/** Set (or clear) how many channels, models, entries… a project may have. */
export function setCountLimit(fn: CountLimit | null): void {
    countLimit = fn;
}

function ask(fn: ProjectLimit | null, projectId: string, what: string): number | null {
    if (!fn) return null;
    try {
        const max = fn(projectId);
        return typeof max === 'number' && Number.isFinite(max) && max >= 0 ? Math.floor(max) : null;
    } catch (err) {
        console.warn(`[moteur] ${what} limit lookup failed; not limiting:`, err);
        return null;
    }
}

export function getPeopleLimit(projectId: string): number | null {
    return ask(peopleLimit, projectId, 'people');
}

export function getStorageLimit(projectId: string): number | null {
    return ask(storageLimit, projectId, 'storage');
}

export function getRequestQuota(projectId: string): number | null {
    return ask(requestQuota, projectId, 'request');
}

export function getImageTrafficQuota(projectId: string): number | null {
    return ask(imageTrafficQuota, projectId, 'image traffic');
}

export function getSubmissionQuota(projectId: string): number | null {
    return ask(submissionQuota, projectId, 'submission');
}

export function getCountLimit(projectId: string, kind: CountKind): number | null {
    const fn = countLimit;
    return ask(fn && (id => fn(id, kind)), projectId, kind);
}

/** Every count limit of a project (null: no limit). */
export function getCountLimits(projectId: string): Record<CountKind, number | null> {
    return Object.fromEntries(COUNT_KINDS.map(k => [k, getCountLimit(projectId, k)])) as Record<
        CountKind,
        number | null
    >;
}

const COUNT_NOUNS: Record<CountKind, [one: string, many: string]> = {
    channels: ['API channel', 'API channels'],
    models: ['model', 'models'],
    entries: ['entry', 'entries'],
    forms: ['form', 'forms'],
    structures: ['structure', 'structures'],
    blocks: ['block', 'blocks'],
    templates: ['template', 'templates'],
    pages: ['page', 'pages']
};

/** "100 MB", "2 GB": bytes the way plans state them (1 MB = 1024 × 1024 bytes). */
export function formatBytes(bytes: number): string {
    const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${Number.isInteger(n) ? n : n.toFixed(1)} ${units[i]}`;
}

function limitMessage(limit: PlanLimitKind, max: number): string {
    switch (limit) {
        case 'people':
            return `This project's plan allows ${max} ${max === 1 ? 'person' : 'people'}. Upgrade the plan or remove someone first.`;
        case 'storage':
            return `This project's plan allows ${formatBytes(max)} of files. Upgrade the plan or delete some files first.`;
        case 'requests':
            return `This project has answered the ${max} API requests its plan allows this month. Upgrade the plan to answer more.`;
        case 'imageTraffic':
            return `This project has sent the ${formatBytes(max)} of images and files its plan allows this month. Upgrade the plan to send more.`;
        case 'submissions':
            return `This project's forms have received the ${max} submissions its plan allows this month. Upgrade the plan to receive more.`;
        case 'projects':
            return "You can't start another project yet. Choose a plan for one of your projects, or delete one, first.";
        default: {
            const [one, many] = COUNT_NOUNS[limit];
            return `This project's plan allows ${max.toLocaleString('en-US')} ${max === 1 ? one : many}. Upgrade the plan or delete one first.`;
        }
    }
}

/** Thrown when an action would go over the project's plan. Answers 402 with `code: plan_limit`. */
export class PlanLimitError extends Error {
    readonly status = 402;
    readonly code = 'plan_limit';
    readonly limit: PlanLimitKind;
    readonly max: number;

    constructor(limit: PlanLimitKind, max: number) {
        super(limitMessage(limit, max));
        this.name = 'PlanLimitError';
        this.limit = limit;
        this.max = max;
    }
}

/**
 * Throws PlanLimitError when `taken` seats plus `adding` more would go over the people limit.
 * Callers count what takes a seat (members, and pending invites when inviting).
 */
export function assertPeopleRoom(projectId: string, taken: number, adding = 1): void {
    if (adding <= 0) return;
    const max = getPeopleLimit(projectId);
    if (max !== null && taken + adding > max) throw new PlanLimitError('people', max);
}

/** Throws PlanLimitError when storing `adding` more bytes would go over the storage limit. */
export function assertStorageRoom(projectId: string, used: number, adding: number): void {
    if (adding <= 0) return;
    const max = getStorageLimit(projectId);
    if (max !== null && used + adding > max) throw new PlanLimitError('storage', max);
}

/** Throws PlanLimitError when `answered` requests this month already use up the quota. */
export function assertRequestRoom(projectId: string, answered: number): void {
    const max = getRequestQuota(projectId);
    if (max !== null && answered >= max) throw new PlanLimitError('requests', max);
}

/** Throws PlanLimitError when `sent` bytes of images this month already use up the quota. */
export function assertImageTrafficRoom(projectId: string, sent: number): void {
    const max = getImageTrafficQuota(projectId);
    if (max !== null && sent >= max) throw new PlanLimitError('imageTraffic', max);
}

/** Throws PlanLimitError when `received` submissions this month already use up the quota. */
export function assertSubmissionRoom(projectId: string, received: number): void {
    const max = getSubmissionQuota(projectId);
    if (max !== null && received >= max) throw new PlanLimitError('submissions', max);
}

/** Throws PlanLimitError when a project with `taken` of a kind may not add `adding` more. */
export function assertCountRoom(
    projectId: string,
    kind: CountKind,
    taken: number,
    adding = 1
): void {
    if (adding <= 0) return;
    const max = getCountLimit(projectId, kind);
    if (max !== null && taken + adding > max) throw new PlanLimitError(kind, max);
}

/**
 * assertCountRoom, counting only when the project has a limit on the kind (counting entries
 * across every model is not free).
 */
export async function checkCountRoom(
    projectId: string,
    kind: CountKind,
    count: () => number | Promise<number>,
    adding = 1
): Promise<void> {
    if (adding <= 0 || getCountLimit(projectId, kind) === null) return;
    assertCountRoom(projectId, kind, await count(), adding);
}

/** Throws PlanLimitError when this person may not start another project. */
export function assertProjectRoom(userId: string): void {
    if (!projectsLimit) return;
    let room: { taken: number; max: number } | null;
    try {
        room = projectsLimit(userId);
    } catch (err) {
        console.warn('[moteur] projects limit lookup failed; not limiting:', err);
        return;
    }
    if (room && room.taken >= room.max) throw new PlanLimitError('projects', room.max);
}

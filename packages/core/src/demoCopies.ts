/**
 * Demo copies: someone's own copy of the server's demo, to be shown around (onboarding.ts makes
 * them). A copy is for trying things, not a free extra site: it serves no site (no API keys, no
 * form submissions from sites), it is never its person's free project (a host may give it a
 * plan to try everything on: `project.demoCopied`), and it goes to the trash after
 * DEMO_IDLE_DAYS without a change. Its person can keep it: it then becomes their project like
 * one they made, counted on their plan (their free project, or one that needs a plan).
 */
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { rolesInProject } from '@moteurio/types';
import { workspaceOf } from './workspaces.js';
import { assertProjectRoom } from './planLimits.js';
import { deleteProject, getProject, loadProjects } from './projects.js';
import { getUserById, updateStoredUser } from './users.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { PROJECT_KEY } from './utils/storageKeys.js';
import { getRepoLog, isGitRepo } from './git/gitService.js';
import { projectDir } from './utils/pathUtils.js';
import { triggerEvent } from './utils/eventBus.js';

/** Days a demo copy is kept without a change before it goes to the trash. */
export const DEMO_IDLE_DAYS = 30;

export const isDemoCopy = (project: Pick<ProjectSchema, 'demo'> | null | undefined): boolean =>
    !!project?.demo;

/** Refuses what a demo copy can't do, saying how to: keep it first. */
export function assertNotDemoCopy(
    project: Pick<ProjectSchema, 'demo'> | null | undefined,
    what: string
): void {
    if (!isDemoCopy(project)) return;
    throw Object.assign(
        new Error(`This is a demo copy: it can’t ${what}. Keep it as your project first.`),
        { status: 409, statusCode: 409, code: 'DEMO_COPY' }
    );
}

/**
 * Makes a demo copy someone's own project: the mark goes, and the project counts on their plan as
 * one they made would (`project.afterCreate`: billing records them as its owner). Only its Admin,
 * and only within how many projects they may start.
 */
export async function keepDemoCopy(user: User, projectId: string): Promise<ProjectSchema> {
    const project = await getProject(user, projectId);
    if (!isDemoCopy(project))
        throw Object.assign(new Error('This project is not a demo copy.'), {
            status: 409,
            statusCode: 409,
            code: 'NOT_DEMO_COPY'
        });
    if (!rolesInProject(user, project, workspaceOf(project)).includes('admin'))
        throw Object.assign(new Error('Only the copy’s Admin can keep it.'), {
            status: 403,
            statusCode: 403
        });
    assertProjectRoom(user.id);
    const stored = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
    if (!stored) throw Object.assign(new Error('Project not found'), { status: 404 });
    const { demo: _demo, ...kept } = stored;
    await putProjectJson(projectId, PROJECT_KEY, kept);
    // Clear the user's demo project id so the new-project page can offer them another demo copy.
    await updateStoredUser(user.id, u =>
        u.onboarding?.demoProjectId === projectId
            ? { ...u, onboarding: { ...u.onboarding, demoProjectId: undefined } }
            : u
    );
    await triggerEvent('project.afterCreate', { project: kept, user });
    return kept;
}

/** When the copy last changed: its last commit, else when it was copied. */
function lastChange(project: ProjectSchema): number {
    const dir = projectDir(project.id);
    const head = isGitRepo(dir) ? getRepoLog(dir, 1)[0] : undefined;
    const at = Date.parse(head?.date ?? project.demo?.copiedAt ?? '');
    return Number.isFinite(at) ? at : Date.now();
}

/**
 * Demo copies without a change for DEMO_IDLE_DAYS go to the trash (as when their person deletes
 * them). Returns their ids.
 */
export async function sweepIdleDemoCopies(now = Date.now()): Promise<string[]> {
    const gone: string[] = [];
    for (const project of loadProjects()) {
        if (!isDemoCopy(project)) continue;
        if (now - lastChange(project) < DEMO_IDLE_DAYS * 86_400_000) continue;
        const owner = (project.users ?? []).map(id => getUserById(id)).find(Boolean);
        if (!owner) continue;
        try {
            await deleteProject(owner, project.id);
            gone.push(project.id);
            console.log(
                `[moteur] Demo copy ${project.id} went to the trash after ${DEMO_IDLE_DAYS} idle days.`
            );
        } catch (err) {
            console.error(
                `[moteur] Demo copy ${project.id} could not be cleared:`,
                err instanceof Error ? err.message : err
            );
        }
    }
    return gone;
}

let timer: ReturnType<typeof globalThis.setInterval> | undefined;

/** Checks for idle demo copies every `intervalMs` (six hours by default) until stopped. */
export function startDemoSweeper(intervalMs = 6 * 3_600_000): void {
    stopDemoSweeper();
    const run = () =>
        void sweepIdleDemoCopies().catch(err => console.error('[moteur] Demo sweep failed:', err));
    timer = globalThis.setInterval(run, intervalMs);
    timer.unref?.();
}

export function stopDemoSweeper(): void {
    if (timer) globalThis.clearInterval(timer);
    timer = undefined;
}

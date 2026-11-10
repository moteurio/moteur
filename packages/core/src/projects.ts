import fs from 'fs';
import path from 'path';
import { creatorRoles, isInProject, PROJECT_CREATOR_ROLES } from '@moteurio/types';
import type { NewProject, ProjectSchema } from '@moteurio/types/Project.js';
import { User } from '@moteurio/types/User.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { isValidId } from './utils/idUtils.js';
import { isExistingProjectId } from './utils/fileUtils.js';
import {
    projectDir,
    baseProjectsDir,
    deletedProjectDir,
    deletedProjectsDir,
    trashProjectDir
} from './utils/pathUtils.js';
import { assertUserCanAccessProject, assertUserCanCreateProject } from './utils/access.js';
import { triggerEvent } from './utils/eventBus.js';
import { validateProject } from './validators/validateProject.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { PROJECT_KEY } from './utils/storageKeys.js';
import { mergeProjectSecrets, readProjectSecrets } from './utils/projectSecrets.js';
import { ensureProjectState } from './utils/stateStore.js';
import {
    ensurePersonalWorkspace,
    getWorkspace,
    workspaceForNewProject,
    workspaceOf
} from './workspaces.js';
import { canStartProjectIn, runsWorkspace } from '@moteurio/types/Workspace.js';
import { getContentIndex } from './contentIndex/index.js';
import { ensureUserData } from './utils/userDataStore.js';
import { initRepo, cloneFromRemote, addAllAndCommit, schedulePush } from './git/index.js';
import { asPublished, pinCopy, renameCopy } from './projectCopyVersions.js';
import { getEffectiveGitRemoteUrl, applyProjectGitSideEffects } from './utils/projectGit.js';
import {
    addProjectToUser,
    getUserById,
    removeProjectFromAllUsers,
    removeProjectFromUser
} from './users.js';
import { assertPeopleRoom, assertProjectRoom } from './planLimits.js';
import { getBlueprint } from './blueprints.js';
import { readTextCachedSync } from './utils/fileCache.js';

export function loadProjects(): ProjectSchema[] {
    const root = baseProjectsDir();

    if (!fs.existsSync(root)) return [];

    return fs
        .readdirSync(root)
        .filter(dir => {
            const fullPath = path.join(root, dir, 'project.json');
            return fs.existsSync(fullPath);
        })
        .map(dir => {
            const configPath = path.join(root, dir, 'project.json');
            try {
                const raw = readTextCachedSync(configPath);
                const schema = mergeProjectSecrets(
                    JSON.parse(raw) as ProjectSchema,
                    readProjectSecrets(path.join(root, dir))
                );
                return { ...schema, id: dir };
            } catch (err) {
                console.error(`[Moteur] Failed to load project config for "${dir}"`, err);
                return null;
            }
        })
        .filter((p): p is ProjectSchema => p !== null);
}

/** One project as stored (no user check), or null when there is none. */
export function loadProject(projectId: string): ProjectSchema | null {
    if (!isValidId(projectId)) return null;
    const dir = path.join(baseProjectsDir(), projectId);
    const configPath = path.join(dir, 'project.json');
    if (!fs.existsSync(configPath)) return null;
    try {
        const schema = mergeProjectSecrets(
            JSON.parse(readTextCachedSync(configPath)) as ProjectSchema,
            readProjectSecrets(dir)
        );
        return { ...schema, id: projectId };
    } catch {
        return null;
    }
}

/**
 * IDs of the projects the user can access: those they are a member of and those they reach
 * through a workspace. Use this for the JWT and /auth/me so project.json and the workspaces stay
 * the source of truth.
 */
export function getProjectIdsForUser(userId: string): string[] {
    return loadProjects()
        .filter(p => isInProject(userId, p, workspaceOf(p)))
        .map(p => p.id);
}

export async function getProject(user: User, projectId: string): Promise<ProjectSchema> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }
    if (!isExistingProjectId(projectId)) {
        throw new Error(`Project "${projectId}" not found`);
    }

    const project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
    if (!project || !project.id) {
        throw new Error(`Project "${projectId}" not found`);
    }

    assertUserCanAccessProject(user, { ...project, id: projectId });
    return { ...project, id: projectId };
}

/**
 * Load project by id without user check. For internal use only (e.g. API key verification).
 * Returns null if project does not exist.
 */
export async function getProjectById(projectId: string): Promise<ProjectSchema | null> {
    if (!isValidId(projectId)) return null;
    if (!isExistingProjectId(projectId)) return null;
    const project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
    if (!project || !project.id) return null;
    return { ...project, id: projectId };
}

export function listProjects(user: User): ProjectSchema[] {
    return loadProjects().filter(project => {
        try {
            assertUserCanAccessProject(user, project);
            return true;
        } catch {
            return false;
        }
    });
}

export async function createProject(
    user: User,
    input: NewProject
): Promise<{ project?: ProjectSchema; validation?: ValidationResult }> {
    assertUserCanCreateProject(user);
    assertProjectRoom(user.id);
    if (!input || !input.id || !isValidId(input.id)) {
        throw new Error(`Invalid project schema: "${JSON.stringify(input)}"`);
    }
    if (isExistingProjectId(input.id)) {
        throw new Error(`Project with id "${input.id}" already exists`);
    }
    // Reserve the demo project id for the server, otherwise a user could take it and every new user
    // would copy their project.
    const demoId = process.env.DEMO_PROJECT_ID?.trim();
    if (demoId && input.id === demoId) {
        throw Object.assign(new Error(`The project id "${input.id}" is reserved on this server.`), {
            status: 409
        });
    }

    const workspace = await workspaceForNewProject(user, input.workspaceId);
    const project: ProjectSchema = { ...input, workspaceId: workspace.id };

    const validationErrors = validateProject(project);
    if (validationErrors.issues.length > 0) {
        return { validation: validationErrors };
    }

    // Assign the creating user to the project if not already
    const projectWithUsers = { ...project };
    if (!projectWithUsers.users?.length) {
        projectWithUsers.users = [user.id];
    } else if (!projectWithUsers.users.includes(user.id)) {
        projectWithUsers.users = [...projectWithUsers.users, user.id];
    }
    projectWithUsers.memberRoles = {
        ...projectWithUsers.memberRoles,
        [user.id]: creatorRoles(user)
    };
    // Ensure new projects are active
    projectWithUsers.isActive = project.isActive !== undefined ? project.isActive : true;

    await triggerEvent('project.beforeCreate', { project: projectWithUsers, user });

    const dir = projectDir(projectWithUsers.id);
    const made = !fs.existsSync(dir);
    fs.mkdirSync(dir, { recursive: true });

    const remoteUrl = getEffectiveGitRemoteUrl(projectWithUsers);
    try {
        if (remoteUrl) {
            await cloneFromRemote(dir, remoteUrl);
        } else {
            await initRepo(dir);
        }

        await putProjectJson(projectWithUsers.id, PROJECT_KEY, projectWithUsers);
        await ensureProjectState(projectWithUsers.id);
        await ensureUserData(projectWithUsers.id);
    } catch (err) {
        // Roll back on failure, because a half-created project folder would keep the id taken by a
        // project no one can use.
        if (made) fs.rmSync(dir, { recursive: true, force: true });
        throw err;
    }

    const pathsToCommit = [PROJECT_KEY];
    if (!remoteUrl) pathsToCommit.push('.gitignore');
    triggerEvent('content.saved', {
        projectId: projectWithUsers.id,
        paths: pathsToCommit,
        message: remoteUrl
            ? `Add project — ${user.name ?? user.id}`
            : `Initial project — ${user.name ?? user.id}`,
        user
    });

    await addProjectToUser(user.id, projectWithUsers.id);

    triggerEvent('project.afterCreate', { project: projectWithUsers, user });
    return { project: projectWithUsers };
}

/** What making a project from a blueprint did: the import of its bundle. */
export type BlueprintOutcome = {
    id: string;
    status: 'done' | 'failed' | 'awaiting_approval';
    issues: { path: string; message: string }[];
    notes?: { path: string; message: string }[];
};

/**
 * Create a project, then import its blueprint's bundle into it: schemas, files, pages, entries
 * and menus, all or nothing, live as the bundle says. Without a blueprint (or one without a
 * bundle), the project starts empty. A bundle that fails leaves the project made and empty, and
 * says why (`blueprint.issues`).
 */
export async function createProjectFromBlueprint(
    user: User,
    project: NewProject,
    blueprintId: string | undefined
): Promise<{
    project?: ProjectSchema;
    validation?: ValidationResult;
    blueprint?: BlueprintOutcome;
}> {
    if (blueprintId !== undefined && blueprintId !== '') {
        // Refuse an unknown blueprint before creating anything.
        let found: ReturnType<typeof getBlueprint> | undefined;
        try {
            if (isValidId(blueprintId)) found = getBlueprint('project', blueprintId);
        } catch {
            found = undefined;
        }
        if (!found || (found.kind ?? 'project') !== 'project')
            throw Object.assign(new Error(`No project blueprint "${blueprintId}"`), {
                status: 404,
                code: 'BLUEPRINT_NOT_FOUND'
            });
    }
    const result = await createProject(user, project);
    if (result.validation || !result.project || !blueprintId) return result;

    const blueprint = getBlueprint('project', blueprintId);
    if (!blueprint.bundle) return result;
    const { importBundle } = await import('./imports/importBundle.js');
    const { adaptBundleToLanguages } = await import('./imports/bundleLanguages.js');
    // Adapt the blueprint's content to the project's languages.
    const made = result.project;
    const bundle = adaptBundleToLanguages(blueprint.bundle, blueprint.languages ?? ['en'], {
        defaultLocale: made.defaultLocale,
        locales: made.supportedLocales ?? []
    });
    const outcome = await importBundle(user, made.id, bundle);
    return {
        ...result,
        blueprint: {
            id: blueprintId,
            status: outcome.status,
            issues: outcome.issues,
            ...(outcome.notes?.length && { notes: outcome.notes })
        }
    };
}

/**
 * Merges a PATCH body into the current project. Same rules as `updateProject`:
 * shallow spread; `null` in the patch removes a top-level key.
 */
export function applyProjectPatch(
    current: ProjectSchema,
    patch: Partial<ProjectSchema>
): ProjectSchema {
    let updated: ProjectSchema = { ...current, ...patch };
    for (const key of Object.keys(patch) as (keyof ProjectSchema)[]) {
        if ((patch as Record<string, unknown>)[key] === null) {
            delete (updated as unknown as Record<string, unknown>)[key as string];
        }
    }
    return updated;
}

export async function updateProject(
    user: User,
    projectId: string,
    patch: Partial<ProjectSchema>
): Promise<ProjectSchema> {
    const current = await getProject(user, projectId);
    // The workspace can only change by moving the project to another workspace, never through a
    // regular update.
    const updated = { ...applyProjectPatch(current, patch), workspaceId: current.workspaceId };
    await triggerEvent('project.beforeUpdate', { project: updated, user });

    // Keep user.projects in sync when project.users changes (so JWT and presence get correct list
    // after re-login)
    if (patch.users !== undefined) {
        const prev = new Set((current.users ?? []) as string[]);
        const next = new Set((updated.users ?? []) as string[]);
        assertPeopleRoom(projectId, prev.size, next.size - prev.size);
        for (const uid of next) {
            if (!prev.has(uid)) await addProjectToUser(uid, projectId);
        }
        for (const uid of prev) {
            if (!next.has(uid)) await removeProjectFromUser(uid, projectId);
        }
    }

    await putProjectJson(projectId, PROJECT_KEY, updated);
    await applyProjectGitSideEffects(current, updated, patch, projectId, user);
    triggerEvent('content.saved', {
        projectId,
        paths: [PROJECT_KEY],
        message: `Update project — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('project.afterUpdate', { project: updated, user });
    return updated;
}

/**
 * Make someone a member with these roles in the project (e.g. accepting an invite). Callers decide
 * whether they may join; an existing member keeps their place and gets these roles.
 */
export async function addProjectMember(
    projectId: string,
    member: User,
    roles: string[]
): Promise<ProjectSchema> {
    const current = await getProjectById(projectId);
    if (!current) throw new Error(`Project "${projectId}" not found`);
    const users = (current.users ?? []) as string[];
    if (!users.includes(member.id)) assertPeopleRoom(projectId, users.length);
    const updated: ProjectSchema = {
        ...current,
        users: users.includes(member.id) ? users : [...users, member.id],
        memberRoles: { ...current.memberRoles, [member.id]: roles }
    };

    await triggerEvent('project.beforeUpdate', { project: updated, user: member });
    await putProjectJson(projectId, PROJECT_KEY, updated);
    await addProjectToUser(member.id, projectId);
    triggerEvent('content.saved', {
        projectId,
        paths: [PROJECT_KEY],
        message: `Add member — ${member.name ?? member.id}`,
        user: member
    });
    triggerEvent('project.afterUpdate', { project: updated, user: member });
    return updated;
}

/**
 * Move a project to another workspace, for example to hand it over to a client's workspace. The
 * owners and admins of its current workspace may move it, and only to a workspace where they may
 * start projects. Members added to the project individually keep their access. Members of the old
 * workspace's team lose access, and members of the new workspace's team gain it.
 */
export async function moveProject(
    user: User,
    projectId: string,
    workspaceId: string
): Promise<ProjectSchema> {
    const current = await getProject(user, projectId);
    const from = workspaceOf(current);
    if (!runsWorkspace(from?.members?.[user.id]?.role))
        throw Object.assign(
            new Error('Only the owners and admins of its workspace can move a project.'),
            { status: 403, statusCode: 403 }
        );
    const to = getWorkspace(workspaceId);
    if (!to || !to.members?.[user.id])
        throw Object.assign(new Error(`Workspace "${workspaceId}" not found.`), {
            status: 404,
            statusCode: 404,
            code: 'WORKSPACE_NOT_FOUND'
        });
    if (to.id === current.workspaceId) return current;
    if (!canStartProjectIn(to, user.id))
        throw Object.assign(
            new Error('Only its owners, admins and members bring projects into a workspace.'),
            { status: 403, statusCode: 403 }
        );
    const updated: ProjectSchema = { ...current, workspaceId: to.id };
    await triggerEvent('project.beforeUpdate', { project: updated, user });
    await putProjectJson(projectId, PROJECT_KEY, updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [PROJECT_KEY],
        message: `Move to workspace ${to.name} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('project.afterUpdate', { project: updated, user });
    triggerEvent('project.afterMove', { project: updated, from: current.workspaceId, user });
    return updated;
}

/**
 * Removes a user from every project of a workspace after they leave its team, including projects
 * they were added to individually. Returns the ids of the projects they were removed from.
 */
export async function leaveWorkspaceProjects(
    workspaceId: string,
    userId: string,
    by: User
): Promise<string[]> {
    const left: string[] = [];
    for (const project of loadProjects().filter(p => p.workspaceId === workspaceId)) {
        const users = (project.users ?? []) as string[];
        if (!users.includes(userId) && !project.memberRoles?.[userId]) continue;
        const memberRoles = { ...project.memberRoles };
        delete memberRoles[userId];
        const updated: ProjectSchema = {
            ...project,
            users: users.filter(id => id !== userId),
            memberRoles
        };
        await putProjectJson(project.id, PROJECT_KEY, updated);
        await removeProjectFromUser(userId, project.id);
        triggerEvent('content.saved', {
            projectId: project.id,
            paths: [PROJECT_KEY],
            message: `Remove member ${userId} (left the workspace)`,
            user: by
        });
        triggerEvent('project.afterUpdate', { project: updated, user: by });
        left.push(project.id);
    }
    return left;
}

export async function deleteProject(user: User, projectId: string): Promise<void> {
    const project = await getProject(user, projectId);

    await triggerEvent('project.beforeDelete', { project, user });

    const source = path.join(baseProjectsDir(), projectId);
    const dest = deletedProjectDir(projectId);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    (await getContentIndex()).close(projectId);
    fs.renameSync(source, dest);
    // Delete the project's bin (its deleted items) together with the project.
    const bin = trashProjectDir(projectId);
    if (fs.existsSync(bin)) fs.renameSync(bin, path.join(dest, '.bin'));

    await removeProjectFromAllUsers(projectId);

    triggerEvent('project.afterDelete', { project, user });
}

/** A deleted project waiting in the trash: its id, when, and its folder's name there. */
export type TrashedProject = { id: string; deletedAt: string; folder: string };

/** Every deleted project still in the trash, newest first. */
export function listTrashedProjects(): TrashedProject[] {
    const dir = deletedProjectsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => {
            const [id, at] = e.name.split('@');
            const deletedAt = at
                ? at.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z')
                : fs.statSync(path.join(dir, e.name)).mtime.toISOString();
            return { id: id!, deletedAt, folder: e.name };
        })
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * For server operators: permanently removes a deleted project's copy from the trash, including its
 * files and history. No other data on the server references it.
 */
export function purgeTrashedProject(folder: string): void {
    const found = listTrashedProjects().find(t => t.folder === folder);
    if (!found) throw Object.assign(new Error('No such project in the trash'), { status: 404 });
    fs.rmSync(path.join(deletedProjectsDir(), found.folder), { recursive: true, force: true });
}

/**
 * For server operators: permanently deletes a project immediately, skipping the trash. Its members
 * lose access as in a normal delete, then its files and history are removed.
 */
export async function purgeProject(operator: User, projectId: string): Promise<void> {
    if (!isValidId(projectId) || !isExistingProjectId(projectId))
        throw Object.assign(new Error(`Project "${projectId}" not found`), { status: 404 });
    const project =
        (await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY)) ??
        ({ id: projectId } as ProjectSchema);
    await triggerEvent('project.beforeDelete', { project, user: operator });
    (await getContentIndex()).close(projectId);
    fs.rmSync(path.join(baseProjectsDir(), projectId), { recursive: true, force: true });
    fs.rmSync(trashProjectDir(projectId), { recursive: true, force: true });
    await removeProjectFromAllUsers(projectId);
    triggerEvent('project.afterDelete', { project, user: operator });
}

const DEFAULT_DEMO_PROJECT_ID = 'demo';

/**
 * Returns the project ID to use as the demo template for new users.
 * Set DEMO_PROJECT_ID in env to override (e.g. if your template project has another id).
 */
export function getDemoProjectId(): string {
    const id = (process.env.DEMO_PROJECT_ID || DEFAULT_DEMO_PROJECT_ID).trim();
    return id || DEFAULT_DEMO_PROJECT_ID;
}

/**
 * Copies an existing project (e.g. demo) to a new project id and assigns it to the given user.
 * Used for onboarding so new users always have one project available.
 * @param sourceProjectId - Template project to copy (e.g. from getDemoProjectId())
 * @param newProjectId - Must be valid and not already exist
 * @param userId - User to assign as sole owner
 */
export async function copyProjectForNewUser(
    sourceProjectId: string,
    newProjectId: string,
    userId: string,
    extra: Partial<ProjectSchema> = {}
): Promise<ProjectSchema> {
    if (!isValidId(sourceProjectId) || !isValidId(newProjectId) || !userId) {
        throw new Error('copyProjectForNewUser: invalid sourceProjectId, newProjectId, or userId');
    }
    if (isExistingProjectId(newProjectId)) {
        throw new Error(`Project "${newProjectId}" already exists`);
    }
    if (!isExistingProjectId(sourceProjectId)) {
        throw new Error(`Source project "${sourceProjectId}" not found`);
    }

    const base = baseProjectsDir();
    const sourceDir = path.join(base, sourceProjectId);
    const destDir = path.join(base, newProjectId);

    // Copy content only: models, entries, pages and media. Never copy project state (.moteur: secrets,
    // notes, AI log, notifications), the history, the outbound hooks or what visitors sent.
    fs.cpSync(sourceDir, destDir, {
        recursive: true,
        filter: src => {
            const top = path.relative(sourceDir, src).split(path.sep)[0];
            return (
                top === '' ||
                !(top.startsWith('.') || top === 'user-data' || top === 'webhooks.json')
            );
        }
    });
    const destGit = path.join(destDir, '.git');
    if (fs.existsSync(destGit)) {
        fs.rmSync(destGit, { recursive: true });
    }
    // The copy builds its own content index on first use, so the source's index is not copied.
    fs.rmSync(path.join(destDir, '.moteur', 'cache'), { recursive: true, force: true });
    await initRepo(destDir);

    const project = await getProjectJson<ProjectSchema>(newProjectId, PROJECT_KEY);
    if (!project) throw new Error(`Project data not found in "${sourceProjectId}"`);

    // Do not copy settings that connect to outside services: API keys, the git remote and hosts.
    const {
        apiKeys: _apiKeys,
        git: _git,
        integrations: _integrations,
        videoProviders: _videoProviders,
        assetConfig: _assetConfig,
        ...content
    } = project;
    // Put the copy in the user's own workspace unless another workspace is given.
    const owner = getUserById(userId);
    const workspaceId =
        extra.workspaceId ?? (owner ? (await ensurePersonalWorkspace(owner)).id : undefined);
    if (!workspaceId) throw new Error(`copyProjectForNewUser: no user "${userId}"`);
    const updated: ProjectSchema = {
        ...content,
        workspaceId,
        id: newProjectId,
        label: (project.label || 'Demo').replace(/^demo$/i, 'My Demo') || 'My Demo',
        users: [userId],
        memberRoles: { [userId]: [...PROJECT_CREATOR_ROLES] },
        ...extra
    };
    await putProjectJson(newProjectId, PROJECT_KEY, updated);
    // Make the copy's published state match the source's published state (see projectCopyVersions.ts).
    const published = await asPublished(sourceDir, newProjectId);
    await renameCopy(newProjectId, sourceProjectId);
    const userForCommit = {
        id: userId,
        name: userId,
        isActive: true,
        email: '',
        roles: ['writer'],
        projects: []
    };
    const commit = await addAllAndCommit(
        destDir,
        `Copy from ${sourceProjectId} — ${userId}`,
        userForCommit
    );
    if (commit) await pinCopy(newProjectId, commit, published);
    schedulePush(destDir);
    await addProjectToUser(userId, newProjectId);

    return { ...updated, id: newProjectId };
}

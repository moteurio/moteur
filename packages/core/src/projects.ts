import fs from 'fs';
import path from 'path';
import { ProjectSchema } from '@moteurio/types/Project.js';
import { User } from '@moteurio/types/User.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { isValidId } from './utils/idUtils.js';
import { isExistingProjectId } from './utils/fileUtils.js';
import { projectDir, baseProjectsDir, projectFilePath } from './utils/pathUtils.js';
import { assertUserCanAccessProject, assertUserCanCreateProject } from './utils/access.js';
import { triggerEvent } from './utils/eventBus.js';
import { validateProject } from './validators/validateProject.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { PROJECT_KEY } from './utils/storageKeys.js';
import { ensureWorkspace } from './utils/workspaceStore.js';
import { ensureUserData } from './utils/userDataStore.js';
import { initRepo, cloneFromRemote, addAllAndCommit, push } from './git/index.js';
import { getEffectiveGitRemoteUrl, applyProjectGitSideEffects } from './utils/projectGit.js';
import { removeProjectFromAllUsers, addProjectToUser, removeProjectFromUser } from './users.js';
import { getBlueprint } from './blueprints.js';
import type { BlueprintTemplate } from '@moteurio/types/Blueprint.js';
import { createModelSchema } from './models.js';
import { createLayout } from './layouts.js';
import { createStructure } from './structures.js';

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
                const raw = fs.readFileSync(configPath, 'utf-8');
                const schema = JSON.parse(raw) as ProjectSchema;
                return { ...schema, id: dir };
            } catch (err) {
                console.error(`[Moteur] Failed to load project config for "${dir}"`, err);
                return null;
            }
        })
        .filter((p): p is ProjectSchema => p !== null);
}

/**
 * Project IDs the user is allowed to access (from each project.json's users array).
 * Use this for JWT and /auth/me so project.json is the single source of truth.
 */
export function getProjectIdsForUser(userId: string): string[] {
    const projects = loadProjects();
    return projects
        .filter(p => Array.isArray(p.users) && (p.users as string[]).includes(userId))
        .map(p => p.id);
}

export async function getProject(user: User, projectId: string): Promise<ProjectSchema> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }
    if (!isExistingProjectId(projectId)) {
        throw new Error(`Project "${projectId}" not found`);
    }

    let project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
    if (!project || !project.id) {
        throw new Error(`Project "${projectId}" not found`);
    }

    // Backfill audit for projects created before audit plugin or without meta.audit
    const audit = project.meta?.audit;
    const needsAuditBackfill = !audit?.createdAt || !audit?.updatedAt;
    if (needsAuditBackfill) {
        const fallback = getAuditFallbackTimestamp(projectId);
        project = {
            ...project,
            meta: {
                ...project.meta,
                audit: {
                    createdAt: audit?.createdAt ?? fallback,
                    updatedAt: audit?.updatedAt ?? fallback,
                    createdBy: audit?.createdBy,
                    updatedBy: audit?.updatedBy,
                    revision: audit?.revision ?? 1
                }
            }
        };
        await putProjectJson(projectId, PROJECT_KEY, project);
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

/** Returns ISO timestamp for audit backfill (file mtime or now). */
function getAuditFallbackTimestamp(projectId: string): string {
    try {
        const filePath = projectFilePath(projectId);
        const stat = fs.statSync(filePath);
        return stat.mtime.toISOString();
    } catch {
        return new Date().toISOString();
    }
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
    project: ProjectSchema
): Promise<{ project?: ProjectSchema; validation?: ValidationResult }> {
    assertUserCanCreateProject(user);
    if (!project || !project.id || !isValidId(project.id)) {
        throw new Error(`Invalid project schema: "${JSON.stringify(project)}"`);
    }
    if (isExistingProjectId(project.id)) {
        throw new Error(`Project with id "${project.id}" already exists`);
    }

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
    // Ensure new projects are active
    projectWithUsers.isActive = project.isActive !== undefined ? project.isActive : true;

    triggerEvent('project.beforeCreate', { project: projectWithUsers, user });

    const dir = projectDir(projectWithUsers.id);
    fs.mkdirSync(dir, { recursive: true });

    const remoteUrl = getEffectiveGitRemoteUrl(projectWithUsers);
    if (remoteUrl) {
        await cloneFromRemote(dir, remoteUrl);
    } else {
        await initRepo(dir);
    }

    await putProjectJson(projectWithUsers.id, PROJECT_KEY, projectWithUsers);
    await ensureWorkspace(projectWithUsers.id);
    await ensureUserData(projectWithUsers.id);

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

    addProjectToUser(user.id, projectWithUsers.id);

    triggerEvent('project.afterCreate', { project: projectWithUsers, user });
    return { project: projectWithUsers };
}

/**
 * Create a new project and apply a blueprint's template (models, layouts, structures).
 * If blueprintId is missing or blueprint has no template, behaves like createProject.
 */
export async function createProjectFromBlueprint(
    user: User,
    project: ProjectSchema,
    blueprintId: string | undefined
): Promise<{ project?: ProjectSchema; validation?: ValidationResult }> {
    const result = await createProject(user, project);
    if (result.validation || !result.project) return result;

    const projectId = result.project.id;
    if (!blueprintId || !isValidId(blueprintId)) return result;

    let blueprint;
    try {
        blueprint = getBlueprint('project', blueprintId);
    } catch {
        return result;
    }
    // Only project blueprints (kind missing or 'project') define project template
    const kind = blueprint.kind ?? 'project';
    if (kind !== 'project') return result;

    const template = blueprint.template as BlueprintTemplate | undefined;
    if (!template) return result;

    try {
        if (template.models?.length) {
            for (const model of template.models) {
                await createModelSchema(user, projectId, model);
            }
        }
        if (template.layouts?.length) {
            for (const layout of template.layouts) {
                await createLayout(user, projectId, layout);
            }
        }
        if (template.structures?.length) {
            for (const structure of template.structures) {
                await createStructure(projectId, structure, user);
            }
        }
    } catch (err) {
        console.error('[Moteur] Failed to apply blueprint template to project', projectId, err);
    }
    return result;
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
    const updated = applyProjectPatch(current, patch);

    // Keep user.projects in sync when project.users changes (so JWT and presence get correct list after re-login)
    if (patch.users !== undefined) {
        const prev = new Set((current.users ?? []) as string[]);
        const next = new Set((updated.users ?? []) as string[]);
        for (const uid of next) {
            if (!prev.has(uid)) addProjectToUser(uid, projectId);
        }
        for (const uid of prev) {
            if (!next.has(uid)) removeProjectFromUser(uid, projectId);
        }
    }

    triggerEvent('project.beforeUpdate', { project: updated, user });

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

export async function deleteProject(user: User, projectId: string): Promise<void> {
    const project = await getProject(user, projectId);

    triggerEvent('project.beforeDelete', { project, user });

    const base = baseProjectsDir();
    const source = path.join(base, projectId);
    const destDir = path.join(base, '.trash', 'projects');
    const dest = path.join(destDir, projectId);

    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(source, dest);

    removeProjectFromAllUsers(projectId);

    triggerEvent('project.afterDelete', { project, user });
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
    userId: string
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

    fs.cpSync(sourceDir, destDir, { recursive: true });
    const destGit = path.join(destDir, '.git');
    if (fs.existsSync(destGit)) {
        fs.rmSync(destGit, { recursive: true });
    }
    await initRepo(destDir);

    const project = await getProjectJson<ProjectSchema>(newProjectId, PROJECT_KEY);
    if (!project) throw new Error(`Project data not found in "${sourceProjectId}"`);

    const updated: ProjectSchema = {
        ...project,
        id: newProjectId,
        label: (project.label || 'Demo').replace(/^demo$/i, 'My Demo') || 'My Demo',
        users: [userId]
    };
    await putProjectJson(newProjectId, PROJECT_KEY, updated);
    const userForCommit = {
        id: userId,
        name: userId,
        isActive: true,
        email: '',
        roles: [],
        projects: []
    };
    addAllAndCommit(destDir, `Copy from ${sourceProjectId} — ${userId}`, userForCommit);
    push(destDir);
    addProjectToUser(userId, newProjectId);

    return { ...updated, id: newProjectId };
}

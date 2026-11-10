import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import type { NewProject, ProjectSchema } from '@moteurio/types/Project.js';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type { User } from '@moteurio/types/User.js';
import type { Persona } from './types.js';
import { asUser } from './boot.js';
import { settle } from './workflow.js';

export type Log = (line: string) => void;

/** Moves an existing project aside. It is kept under projects/.trash and never deleted. */
export function setAside(dataRoot: string, projectId: string): string | null {
    const projects = path.join(dataRoot, 'data', 'projects');
    const dir = path.join(projects, projectId);
    if (!fs.existsSync(dir)) return null;
    const dest = path.join(
        projects,
        '.trash',
        `${projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}`
    );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
    return dest;
}

/**
 * Ensures that every persona exists as a user. Existing users with the same id are left as they
 * are, except that they are given access to the project. New users can sign in when a password is given.
 */
export async function ensurePersonas(personas: Persona[], password?: string): Promise<void> {
    const { listUsers, createUser, reloadUsers } = await import('@moteurio/core/users.js');
    reloadUsers();
    const existing = new Set(listUsers().map(u => u.id));
    const existingEmails = new Set(listUsers().map(u => u.email));
    for (const p of personas) {
        if (existing.has(p.id) || existingEmails.has(p.email)) continue;
        const user: User = {
            ...asUser(p),
            projects: [],
            ...(password && { passwordHash: await bcrypt.hash(password, 10) })
        };
        await createUser(user);
    }
}

export async function createProjectFor(
    project: NewProject,
    lead: Persona,
    personas: Persona[]
): Promise<void> {
    const { createProject } = await import('@moteurio/core/projects.js');
    const { addProjectToUser } = await import('@moteurio/core/users.js');
    const { validateProject } = await import('@moteurio/core/validators/validateProject.js');
    const { ensurePersonalWorkspace } = await import('@moteurio/core/workspaces.js');
    const workspace = await ensurePersonalWorkspace(asUser(lead));
    const withUsers: ProjectSchema = {
        ...project,
        workspaceId: project.workspaceId ?? workspace.id,
        users: personas.map(p => p.id)
    };
    const reserved = validateProject(withUsers).issues.some(i => i.code === 'PROJECT_RESERVED_ID');
    if (reserved) {
        // createProject cannot create a reserved id such as "demo", the template that is copied
        // for new users, so repeat what it does without the id check.
        const { projectDir } = await import('@moteurio/core/utils/pathUtils.js');
        const { initRepo, addAllAndCommit } = await import('@moteurio/core/git/index.js');
        const { putProjectJson } = await import('@moteurio/core/utils/projectStorage.js');
        const { ensureProjectState } = await import('@moteurio/core/utils/stateStore.js');
        const { ensureUserData } = await import('@moteurio/core/utils/userDataStore.js');
        const now = new Date().toISOString();
        const dir = projectDir(project.id);
        fs.mkdirSync(dir, { recursive: true });
        await initRepo(dir);
        await putProjectJson(project.id, 'project.json', {
            ...withUsers,
            meta: {
                audit: {
                    createdAt: now,
                    createdBy: lead.id,
                    updatedAt: now,
                    updatedBy: lead.id,
                    revision: 1
                }
            }
        });
        await ensureProjectState(project.id);
        await ensureUserData(project.id);
        await addAllAndCommit(dir, `Initial project — ${lead.name}`, asUser(lead));
    } else {
        const result = await createProject(asUser(lead), withUsers);
        if (result.validation) {
            throw new Error(
                `Project "${project.id}" is invalid: ${result.validation.issues.map(i => i.message).join('; ')}`
            );
        }
    }
    for (const p of personas) await addProjectToUser(p.id, project.id);
    await settle();
}

export async function installSchemas(
    projectId: string,
    lead: Persona,
    schemas: {
        blocks?: BlockSchema[];
        models?: ModelSchema[];
        templates?: Array<Omit<TemplateSchema, 'createdAt' | 'updatedAt' | 'projectId'>>;
    }
): Promise<void> {
    const user = asUser(lead);
    const { createProjectBlock } = await import('@moteurio/core/blocks.js');
    const { createModelSchema } = await import('@moteurio/core/models.js');
    const { createTemplate } = await import('@moteurio/core/templates.js');
    for (const b of schemas.blocks ?? []) createProjectBlock(projectId, b);
    for (const m of schemas.models ?? []) {
        await createModelSchema(user, projectId, m);
        await settle();
    }
    for (const t of schemas.templates ?? []) {
        await createTemplate(projectId, user, t as Omit<TemplateSchema, 'createdAt' | 'updatedAt'>);
        await settle();
    }
}

export type ValidationReport = {
    entries: number;
    invalid: number;
    errors: Array<{ model: string; entry: string; path: string; message: string }>;
};

/**
 * Validates every entry file of every model in the same way the API validates a save. Files are
 * read one by one, keyed by folder name, so an unreadable file is reported instead of stopping the
 * whole check. Entries of any status are included.
 */
export async function validateEntries(projectId: string): Promise<ValidationReport> {
    const { validateEntry } = await import('@moteurio/core/validators/validateEntry.js');
    const { getModelSchemaForProject } = await import('@moteurio/core/models.js');
    const { getProjectById } = await import('@moteurio/core/projects.js');
    const { projectDir } = await import('@moteurio/core/utils/pathUtils.js');
    const project = await getProjectById(projectId);
    const locales = [project?.defaultLocale, ...(project?.supportedLocales ?? [])].filter(
        (l): l is string => Boolean(l)
    );
    const report: ValidationReport = { entries: 0, invalid: 0, errors: [] };
    const modelsDir = path.join(projectDir(projectId), 'models');
    const dirs = (dir: string) =>
        fs.existsSync(dir)
            ? fs
                  .readdirSync(dir, { withFileTypes: true })
                  .filter(d => d.isDirectory() && !d.name.startsWith('.'))
                  .map(d => d.name)
            : [];
    for (const modelId of dirs(modelsDir)) {
        const schema = await getModelSchemaForProject(projectId, modelId);
        if (!schema) continue;
        for (const entryId of dirs(path.join(modelsDir, modelId, 'entries'))) {
            report.entries++;
            const file = path.join(modelsDir, modelId, 'entries', entryId, 'entry.json');
            let entry: Entry;
            try {
                entry = JSON.parse(fs.readFileSync(file, 'utf-8')) as Entry;
            } catch (err) {
                report.invalid++;
                report.errors.push({
                    model: modelId,
                    entry: entryId,
                    path: 'entry.json',
                    message: `Unreadable: ${(err as Error).message}`
                });
                continue;
            }
            const result = await validateEntry(projectId, entry, schema, {
                projectLocales: locales
            });
            const errors = result.issues.filter(i => i.type === 'error');
            if (errors.length > 0) report.invalid++;
            for (const e of errors) {
                report.errors.push({
                    model: modelId,
                    entry: entryId,
                    path: e.path ?? '',
                    message: e.message
                });
            }
        }
    }
    return report;
}

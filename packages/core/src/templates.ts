import fs from 'fs';
import path from 'path';
import { TemplateSchema } from '@moteurio/types/Template.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { isValidId } from './utils/idUtils.js';
import { User } from '@moteurio/types/User.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { getProject } from './projects.js';
import { triggerEvent } from './utils/eventBus.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { templateKey, templateListPrefix } from './utils/storageKeys.js';
import { templateFilePath, trashTemplatesDir } from './utils/pathUtils.js';
import { validateTemplate } from './validators/validateTemplate.js';

function parseTemplateIds(listResult: string[]): string[] {
    return listResult
        .map(name => (name.endsWith('.json') ? name.slice(0, -5) : name))
        .filter(Boolean);
}

export async function listTemplates(projectId: string): Promise<TemplateSchema[]> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }

    const raw = await listProjectKeys(projectId, templateListPrefix());
    const ids = parseTemplateIds(raw);
    const schemas: TemplateSchema[] = [];

    for (const id of ids) {
        const schema = await getProjectJson<TemplateSchema>(projectId, templateKey(id));
        if (schema) schemas.push(schema);
    }
    return schemas;
}

export async function getTemplate(projectId: string, id: string): Promise<TemplateSchema> {
    if (!isValidId(id)) {
        throw new Error(`Invalid template id: "${id}"`);
    }

    const schema = await getProjectJson<TemplateSchema>(projectId, templateKey(id));
    if (!schema) {
        throw new Error(`Template "${id}" not found in project "${projectId}".`);
    }
    return schema;
}

export async function getTemplateWithAuth(
    user: User,
    projectId: string,
    id: string
): Promise<TemplateSchema> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);
    return getTemplate(projectId, id);
}

export async function createTemplate(
    projectId: string,
    user: User,
    data: Omit<TemplateSchema, 'createdAt' | 'updatedAt'>
): Promise<TemplateSchema> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const id = data.id;
    if (!id || !isValidId(id)) {
        throw new Error('Template "id" is required to create a template.');
    }

    const exists = await hasProjectKey(projectId, templateKey(id));
    if (exists) {
        throw new Error(`Template "${id}" already exists in project "${projectId}".`);
    }

    const now = new Date().toISOString();
    const schema: TemplateSchema = {
        ...data,
        id,
        projectId,
        fields: data.fields ?? {},
        createdAt: now,
        updatedAt: now
    };

    triggerEvent('template.beforeCreate', { template: schema, user, projectId });
    await putProjectJson(projectId, templateKey(id), schema);
    triggerEvent('content.saved', {
        projectId,
        paths: [templateKey(id)],
        message: `Create template ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('template.afterCreate', { template: schema, user, projectId });
    return schema;
}

export async function updateTemplate(
    projectId: string,
    user: User,
    id: string,
    patch: Partial<TemplateSchema>
): Promise<TemplateSchema> {
    const current = await getTemplateWithAuth(user, projectId, id);
    const updated = { ...current, ...patch };

    triggerEvent('template.beforeUpdate', { template: updated, user, projectId });
    await putProjectJson(projectId, templateKey(id), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [templateKey(id)],
        message: `Update template ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('template.afterUpdate', { template: updated, user, projectId });
    return updated;
}

export async function deleteTemplate(projectId: string, user: User, id: string): Promise<void> {
    const current = await getTemplateWithAuth(user, projectId, id);

    triggerEvent('template.beforeDelete', { template: current, user, projectId });

    const source = templateFilePath(projectId, id);
    const destDir = trashTemplatesDir(projectId);
    const dest = path.join(destDir, `${id}.json`);

    try {
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(source, dest);
    } catch (err) {
        if ((err as { code?: string }).code !== 'ENOENT') throw err;
    }

    triggerEvent('content.deleted', {
        projectId,
        paths: [templateKey(id)],
        message: `Delete template ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('template.afterDelete', { template: current, user, projectId });
}

export async function validateTemplateById(
    projectId: string,
    id: string
): Promise<ValidationResult> {
    const schema = await getTemplate(projectId, id);
    return validateTemplate(schema);
}

import fs from 'fs';
import path from 'path';
import { ModelSchema } from '@moteurio/types/Model.js';
import { isValidId } from './utils/idUtils.js';
import { baseModelsDir } from './utils/pathUtils.js';
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
import { modelKey, modelListPrefix, entryListPrefix, entryKey } from './utils/storageKeys.js';

export async function listModelSchemas(user: User, projectId: string): Promise<ModelSchema[]> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }

    await getProject(user, projectId);
    const ids = await listProjectKeys(projectId, modelListPrefix());
    const schemas: ModelSchema[] = [];

    for (const id of ids) {
        const key = modelKey(id);
        const schema = await getProjectJson<ModelSchema>(projectId, key);
        if (schema) schemas.push(schema);
    }
    return schemas;
}

export async function getModelSchema(
    user: User,
    projectId: string,
    schemaId: string
): Promise<ModelSchema> {
    if (!isValidId(schemaId)) {
        throw new Error(`Invalid model schemaId: "${schemaId}"`);
    }

    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const schema = await getProjectJson<ModelSchema>(projectId, modelKey(schemaId));
    if (!schema) {
        throw new Error(`Model schema "${schemaId}" not found in project "${projectId}".`);
    }
    return schema;
}

/** Load model schema without user check. For internal use (e.g. asset resolution in public API). */
export async function getModelSchemaForProject(
    projectId: string,
    schemaId: string
): Promise<ModelSchema | null> {
    if (!isValidId(schemaId)) return null;
    return getProjectJson<ModelSchema>(projectId, modelKey(schemaId));
}

export async function createModelSchema(
    user: User,
    projectId: string,
    schema: ModelSchema
): Promise<ModelSchema> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const exists = await hasProjectKey(projectId, modelKey(schema.id));
    if (exists) {
        throw new Error(`Model schema "${schema.id}" already exists in project "${projectId}".`);
    }

    triggerEvent('model.beforeCreate', { model: schema, user, projectId });

    schema.fields = schema.fields || {};
    await putProjectJson(projectId, modelKey(schema.id), schema);

    triggerEvent('content.saved', {
        projectId,
        paths: [modelKey(schema.id)],
        message: `Create model ${schema.id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('model.afterCreate', { model: schema, user, projectId });
    return schema;
}

/**
 * Validate urlPattern: references [field.path] should exist on the model.
 * Returns list of warning messages (does not reject).
 */
export function validateModelUrlPattern(
    pattern: string | undefined,
    schema: ModelSchema
): string[] {
    if (!pattern || typeof pattern !== 'string') return [];
    const re = /\[([^\]]+)\]/g;
    const warnings: string[] = [];
    let m: RegExpExecArray | null;
    const fieldNames = new Set(Object.keys(schema.fields ?? {}));
    while ((m = re.exec(pattern)) !== null) {
        const path = m[1].trim();
        const top = path.split('.')[0];
        if (top && !fieldNames.has(top)) {
            warnings.push(
                `urlPattern references field "${path}" which is not defined on the model.`
            );
        }
    }
    return warnings;
}

export async function updateModelSchema(
    user: User,
    projectId: string,
    schemaId: string,
    patch: Partial<ModelSchema>
): Promise<ModelSchema> {
    const current = await getModelSchema(user, projectId, schemaId);
    const updated = { ...current, ...patch };

    triggerEvent('model.beforeUpdate', { model: updated, user, projectId });
    await putProjectJson(projectId, modelKey(schemaId), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [modelKey(schemaId)],
        message: `Update model ${schemaId} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('model.afterUpdate', { model: updated, user, projectId });
    return updated;
}

export async function deleteModelSchema(
    user: User,
    projectId: string,
    schemaId: string
): Promise<void> {
    const current = await getModelSchema(user, projectId, schemaId);

    triggerEvent('model.beforeDelete', { model: current, user, projectId });

    const entryIds = await listProjectKeys(projectId, entryListPrefix(schemaId));
    const paths = [modelKey(schemaId), ...entryIds.map(eid => entryKey(schemaId, eid))];

    const base = baseModelsDir(projectId);
    const source = path.join(base, schemaId);
    const destDir = path.join(base, '.trash', 'schemas');
    const dest = path.join(destDir, schemaId);

    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(source, dest);

    triggerEvent('content.deleted', {
        projectId,
        paths,
        message: `Delete model ${schemaId} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('model.afterDelete', { model: current, user, projectId });
}

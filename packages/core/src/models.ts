import fs from 'fs';
import { hasRole } from '@moteurio/types';
import { Entry, ModelSchema } from '@moteurio/types/Model.js';
import { isValidId } from './utils/idUtils.js';
import { modelDir } from './utils/pathUtils.js';
import { binModel, getBinItem, unbinModel } from './contentBin.js';
import { contentForbidden } from './contentAccess.js';
import { withProjectWriteLock } from './utils/projectWriteLock.js';
import { User } from '@moteurio/types/User.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { getProject } from './projects.js';
import { getContentIndex } from './contentIndex/index.js';
import { triggerEvent } from './utils/eventBus.js';
import { checkCountRoom } from './planLimits.js';
import { countOf } from './projectCounts.js';
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
    await checkCountRoom(projectId, 'models', () => countOf(projectId, 'models'));

    await triggerEvent('model.beforeCreate', { model: schema, user, projectId });

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

    await triggerEvent('model.beforeUpdate', { model: updated, user, projectId });
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

    await triggerEvent('model.beforeDelete', { model: current, user, projectId });

    const entryIds = await listProjectKeys(projectId, entryListPrefix(schemaId));
    const paths = [modelKey(schemaId), ...entryIds.map(eid => entryKey(schemaId, eid))];

    // The model's folder goes to the bin whole, its entries with it, until taken out again.
    binModel(projectId, current, modelDir(projectId, schemaId), entryIds.length, user);
    await (await getContentIndex()).modelRemoved(projectId, schemaId);

    triggerEvent('content.deleted', {
        projectId,
        paths,
        message: `Delete model ${schemaId} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('model.afterDelete', { model: current, user, projectId });
}

/** A refusal the API turns into HTTP 409: the project changed since it went in the bin. */
function binConflict(message: string): Error {
    return Object.assign(new Error(message), { statusCode: 409 });
}

/**
 * Takes a deleted model out of the bin with every entry that went with it. Entries come back as
 * drafts (unpublished, if they had been live), as an entry taken out on its own does: putting
 * them on the site again goes through publishing and its review. Refused while another model has
 * its id. Builders, as for making or deleting a model.
 */
export async function restoreModelFromBin(
    user: User,
    projectId: string,
    binId: string
): Promise<{ model: ModelSchema; entryCount: number }> {
    if (!hasRole(user, 'builder') || user?.agent?.reviewOnly)
        throw contentForbidden('Only a builder can take a model out of the bin.');
    await getProject(user, projectId);
    return withProjectWriteLock(projectId, async () => {
        const item = getBinItem(projectId, binId);
        if (item.kind !== 'model') throw binConflict('This is not a model.');
        const { modelId } = item;
        const folder = modelDir(projectId, modelId);
        if ((await hasProjectKey(projectId, modelKey(modelId))) || fs.existsSync(folder))
            throw binConflict(
                `Another model has the id "${modelId}" now. Rename or delete it first.`
            );
        await checkCountRoom(projectId, 'models', () => countOf(projectId, 'models'));
        await checkCountRoom(
            projectId,
            'entries',
            () => countOf(projectId, 'entries'),
            item.entryCount
        );

        unbinModel(projectId, binId, folder);
        const index = await getContentIndex();
        const model =
            (await getProjectJson<ModelSchema>(projectId, modelKey(modelId))) ?? item.model;
        const entryIds = await listProjectKeys(projectId, entryListPrefix(modelId));
        const paths = [modelKey(modelId)];
        for (const entryId of entryIds) {
            const key = entryKey(modelId, entryId);
            const stored = await getProjectJson<Entry>(projectId, key);
            if (!stored) continue;
            const entry: Entry = {
                ...stored,
                status: stored.meta?.audit?.publishedCommit ? 'unpublished' : 'draft'
            };
            await putProjectJson(projectId, key, entry);
            await index.entryWritten(projectId, modelId, entryId, entry);
            paths.push(key);
        }

        await triggerEvent('content.saved', {
            projectId,
            paths,
            message: `Restore model ${modelId} from the bin — ${user.name ?? user.id}`,
            user
        });
        triggerEvent('model.afterRestore', { model, user, projectId });
        return { model, entryCount: paths.length - 1 };
    });
}

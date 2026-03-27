import fs from 'fs';
import path from 'path';
import type { FormSchema } from '@moteurio/types/Form.js';
import { User } from '@moteurio/types/User.js';
import { isValidId } from './utils/idUtils.js';
import { formFilePath, trashFormDir } from './utils/pathUtils.js';
import { getProject } from './projects.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { triggerEvent } from './utils/eventBus.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { formKey, formListPrefix } from './utils/storageKeys.js';

export async function listForms(user: User, projectId: string): Promise<FormSchema[]> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }

    await getProject(user, projectId);
    const ids = await listProjectKeys(projectId, formListPrefix());
    const forms: FormSchema[] = [];

    for (const id of ids) {
        const key = formKey(id);
        const form = await getProjectJson<FormSchema>(projectId, key);
        if (form) forms.push(form);
    }
    return forms;
}

export async function getForm(user: User, projectId: string, formId: string): Promise<FormSchema> {
    if (!isValidId(formId)) {
        throw new Error(`Invalid formId: "${formId}"`);
    }

    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const form = await getProjectJson<FormSchema>(projectId, formKey(formId));
    if (!form) {
        throw new Error(`Form "${formId}" not found in project "${projectId}".`);
    }
    return form;
}

/** Load form without user check. For internal/public use (e.g. form submit handler). */
export async function getFormForProject(
    projectId: string,
    formId: string
): Promise<FormSchema | null> {
    if (!isValidId(formId)) return null;
    return getProjectJson<FormSchema>(projectId, formKey(formId));
}

export async function createForm(
    user: User,
    projectId: string,
    form: FormSchema
): Promise<FormSchema> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    if (!form.id || typeof form.id !== 'string') {
        throw new Error('Form "id" is required and must be a non-empty string.');
    }
    if (!isValidId(form.id)) {
        throw new Error(`Invalid form id: "${form.id}"`);
    }
    if (!form.label || typeof form.label !== 'string' || !form.label.trim()) {
        throw new Error('Form "label" is required and must be a non-empty string.');
    }

    const exists = await hasProjectKey(projectId, formKey(form.id));
    if (exists) {
        throw new Error(`Form "${form.id}" already exists in project "${projectId}".`);
    }

    const now = new Date().toISOString();
    const toStore: FormSchema = {
        ...form,
        status: form.status ?? 'active',
        honeypot: form.honeypot ?? true,
        fields: form.fields ?? {},
        createdAt: now,
        updatedAt: now
    };

    try {
        await triggerEvent('form.beforeCreate', { form: toStore, user, projectId });
    } catch {
        // event must not fail the operation
    }

    await putProjectJson(projectId, formKey(form.id), toStore);

    triggerEvent('content.saved', {
        projectId,
        paths: [formKey(form.id)],
        message: `Create form ${form.id} — ${user.name ?? user.id}`,
        user
    });
    try {
        await triggerEvent('form.afterCreate', { form: toStore, user, projectId });
    } catch {
        // event must not fail the operation
    }
    return toStore;
}

export async function updateForm(
    user: User,
    projectId: string,
    formId: string,
    patch: Partial<FormSchema>
): Promise<FormSchema> {
    const current = await getForm(user, projectId, formId);
    const updated: FormSchema = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
    };

    try {
        await triggerEvent('form.beforeUpdate', { form: updated, user, projectId });
    } catch {
        // event must not fail the operation
    }

    await putProjectJson(projectId, formKey(formId), updated);

    triggerEvent('content.saved', {
        projectId,
        paths: [formKey(formId)],
        message: `Update form ${formId} — ${user.name ?? user.id}`,
        user
    });
    try {
        await triggerEvent('form.afterUpdate', { form: updated, user, projectId });
    } catch {
        // event must not fail the operation
    }
    return updated;
}

export async function deleteForm(user: User, projectId: string, formId: string): Promise<void> {
    const current = await getForm(user, projectId, formId);

    try {
        await triggerEvent('form.beforeDelete', { form: current, user, projectId });
    } catch {
        // event must not fail the operation
    }

    const trashDir = trashFormDir(projectId, formId);
    fs.mkdirSync(trashDir, { recursive: true });
    const dest = path.join(trashDir, `form-${Date.now()}.json`);
    fs.renameSync(formFilePath(projectId, formId), dest);

    triggerEvent('content.deleted', {
        projectId,
        paths: [formKey(formId)],
        message: `Delete form ${formId} — ${user.name ?? user.id}`,
        user
    });
    try {
        await triggerEvent('form.afterDelete', { form: current, user, projectId });
    } catch {
        // event must not fail the operation
    }
}

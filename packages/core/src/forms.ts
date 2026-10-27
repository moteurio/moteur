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
import { checkCountRoom } from './planLimits.js';
import { countOf } from './projectCounts.js';
import { captchaSecret, hasStoredCaptchaSecret, setCaptchaSecret } from './formGuard.js';

/**
 * A captcha's secret key is written with the form but never kept in it (forms are in Git): it
 * goes to the secrets file. What the form keeps says only whether one is set.
 */
function keepCaptchaSecret<T extends Partial<FormSchema>>(
    projectId: string,
    formId: string,
    form: T
): T {
    const out = { ...form };
    const sent = form.captcha as
        (FormSchema['captcha'] & { secretKey?: unknown }) | null | undefined;
    if (sent === null) setCaptchaSecret(projectId, formId, null);
    if (sent && typeof sent === 'object') {
        const { secretKey, secretSet: _secretSet, ...captcha } = sent;
        if (secretKey !== undefined) {
            const secret = typeof secretKey === 'string' ? secretKey.trim() : '';
            setCaptchaSecret(projectId, formId, secret || null);
        }
        out.captcha = captcha;
    }
    // The older setting: its secret moves out the next time the form is saved.
    if (form.recaptcha?.secretKey) {
        if (!sent) setCaptchaSecret(projectId, formId, form.recaptcha.secretKey);
        out.recaptcha = { siteKey: form.recaptcha.siteKey };
    }
    return out;
}

/** The form as people in the Studio see it: whether a captcha secret is set, never the secret. */
function withCaptchaState(projectId: string, form: FormSchema): FormSchema {
    const { recaptcha, ...rest } = form;
    const out: FormSchema = rest;
    const secretSet = Boolean(captchaSecret(projectId, form));
    if (form.captcha) out.captcha = { ...form.captcha, secretSet };
    else if (recaptcha?.siteKey)
        out.captcha = { provider: 'recaptcha', siteKey: recaptcha.siteKey, secretSet };
    return out;
}

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
        if (form) forms.push(withCaptchaState(projectId, form));
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
    return withCaptchaState(projectId, form);
}

/** Load form without user check. For internal/public use (e.g. form submit handler). */
export async function getFormForProject(
    projectId: string,
    formId: string
): Promise<FormSchema | null> {
    if (!isValidId(formId)) return null;
    return getProjectJson<FormSchema>(projectId, formKey(formId));
}

const FORM_STATUSES = ['active', 'inactive', 'archived'];
const FORM_ACTION_TYPES = ['createEntry', 'email', 'webhook'];
const CAPTCHA_PROVIDERS = ['turnstile', 'hcaptcha', 'recaptcha'];

/** One text, or one text per language. */
const isText = (v: unknown) =>
    typeof v === 'string' ||
    (!!v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Object.values(v).every(x => typeof x === 'string'));

/**
 * Checks what a form says it does, so a typo can't break submissions later. Throws a sentence
 * naming the problem ("Invalid form …"), which the API answers with a 422.
 */
export function checkForm(form: Partial<FormSchema>): void {
    const bad = (message: string) => {
        throw new Error(`Invalid form: ${message}`);
    };
    if (form.label !== undefined && (typeof form.label !== 'string' || !form.label.trim()))
        bad('"label" must be a non-empty text.');
    if (form.status !== undefined && !FORM_STATUSES.includes(form.status))
        bad(`"status" must be one of ${FORM_STATUSES.join(', ')}.`);
    if (
        form.fields !== undefined &&
        (!form.fields || typeof form.fields !== 'object' || Array.isArray(form.fields))
    )
        bad('"fields" must be an object of fields.');
    for (const [key, field] of Object.entries(form.fields ?? {})) {
        if (!field || typeof field !== 'object' || typeof field.type !== 'string')
            bad(`field "${key}" needs a "type".`);
        for (const word of ['label', 'description', 'help', 'placeholder'] as const)
            if (field[word] !== undefined && !isText(field[word]))
                bad(`field "${key}": "${word}" must be a text, or one text per language.`);
        if (field.messages !== undefined) {
            if (!field.messages || typeof field.messages !== 'object')
                bad(`field "${key}": "messages" must be texts by issue code.`);
            for (const text of Object.values(field.messages))
                if (!isText(text)) bad(`field "${key}": each message must be a text.`);
        }
    }
    if (form.captcha !== undefined && form.captcha !== null) {
        const c = form.captcha;
        if (typeof c !== 'object' || !CAPTCHA_PROVIDERS.includes(c.provider))
            bad(`"captcha.provider" must be one of ${CAPTCHA_PROVIDERS.join(', ')}.`);
        if (typeof c.siteKey !== 'string' || !c.siteKey.trim()) bad('"captcha.siteKey" is needed.');
        if (
            c.minScore !== undefined &&
            !(typeof c.minScore === 'number' && c.minScore >= 0 && c.minScore <= 1)
        )
            bad('"captcha.minScore" must be between 0 and 1.');
    }
    if (form.timeTrap !== undefined && form.timeTrap !== null) {
        const t = form.timeTrap;
        if (typeof t !== 'object') bad('"timeTrap" must be an object.');
        if (
            t.minSeconds !== undefined &&
            !(typeof t.minSeconds === 'number' && t.minSeconds >= 0 && t.minSeconds <= 600)
        )
            bad('"timeTrap.minSeconds" must be between 0 and 600.');
    }
    if (form.redirectUrl !== undefined && form.redirectUrl !== null) {
        if (typeof form.redirectUrl !== 'string' || !/^(https?:\/\/|\/)/.test(form.redirectUrl))
            bad('"redirectUrl" must start with http://, https:// or /.');
    }
    if (form.actions !== undefined) {
        if (!Array.isArray(form.actions)) bad('"actions" must be a list.');
        form.actions.forEach((action, i) => {
            if (!action || !FORM_ACTION_TYPES.includes(action.type))
                bad(`action ${i + 1} must be one of ${FORM_ACTION_TYPES.join(', ')}.`);
            if (
                action.type === 'createEntry' &&
                (typeof action.modelId !== 'string' || !action.modelId)
            )
                bad(`action ${i + 1} must name the model to create entries in.`);
            if (action.type === 'email' && (!Array.isArray(action.to) || !action.to.length))
                bad(`action ${i + 1} must list who to email.`);
        });
    }
    const to = form.notifications?.onSubmit?.to;
    if (to !== undefined && (!Array.isArray(to) || to.some(x => typeof x !== 'string')))
        bad('"notifications.onSubmit.to" must be a list of email addresses.');
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

    checkForm(form);
    form = keepCaptchaSecret(projectId, form.id, form);

    const exists = await hasProjectKey(projectId, formKey(form.id));
    if (exists) {
        throw new Error(`Form "${form.id}" already exists in project "${projectId}".`);
    }
    await checkCountRoom(projectId, 'forms', () => countOf(projectId, 'forms'));

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
    return withCaptchaState(projectId, toStore);
}

export async function updateForm(
    user: User,
    projectId: string,
    formId: string,
    patch: Partial<FormSchema>
): Promise<FormSchema> {
    await getForm(user, projectId, formId);
    // As stored, not as the Studio sees it.
    const current = (await getProjectJson<FormSchema>(projectId, formKey(formId)))!;
    checkForm(patch);
    // Saving a form still holding the older secret moves it out too; a new one sent wins.
    if (current.recaptcha?.secretKey) {
        if (!hasStoredCaptchaSecret(projectId, formId))
            setCaptchaSecret(projectId, formId, current.recaptcha.secretKey);
        current.recaptcha = { siteKey: current.recaptcha.siteKey };
    }
    patch = keepCaptchaSecret(projectId, formId, patch);
    const updated: FormSchema = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
    };
    // `null` takes a setting away (a redirect, the notifications…).
    for (const [key, value] of Object.entries(patch))
        if (value === null) delete (updated as unknown as Record<string, unknown>)[key];

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
    return withCaptchaState(projectId, updated);
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

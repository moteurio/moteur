import type {
    FormActionOutcome,
    PluginFormAction,
    PluginFormField,
    PluginSubmissionHold,
    PluginSubmissionScreen,
    SubmissionScreenContext,
    SubmissionScreenVerdict
} from '@moteurio/types/FormPlugin.js';
import type { FormSchema, FormSubmission } from '@moteurio/types/Form.js';

/**
 * Form extensions that plugins register: actions, field checks, spam checks and holds. Each one is
 * registered once, by the plugin that owns it. A plugin failure never prevents a submission from
 * being saved.
 */

const actions = new Map<string, PluginFormAction & { pluginId?: string }>();
const fields = new Map<string, PluginFormField & { pluginId?: string }>();
const screens = new Map<string, PluginSubmissionScreen & { pluginId?: string }>();
const holds = new Map<string, PluginSubmissionHold & { pluginId?: string }>();

/** Maximum time one plugin action may take for one submission. */
export const ACTION_TIMEOUT_MS = 15_000;
/** Maximum time a spam check or a hold may take. After that the submission is processed without it. */
export const SCREEN_TIMEOUT_MS = 3_000;

function claim<T extends object>(
    map: Map<string, T & { pluginId?: string }>,
    key: string,
    value: T,
    what: string,
    pluginId?: string
): void {
    if (!key || typeof key !== 'string') throw new Error(`A form ${what} needs an id.`);
    const taken = map.get(key);
    if (taken && taken.pluginId !== pluginId)
        throw new Error(`The form ${what} "${key}" is already registered by another plugin.`);
    map.set(key, { ...value, pluginId });
}

export function registerFormAction(action: PluginFormAction, pluginId?: string): void {
    // Requiring a `plugin:name` type prevents clashes with the engine's own action types (createEntry, email, webhook).
    if (!/^[a-z0-9-]+:[a-zA-Z0-9-]+$/.test(action.type))
        throw new Error(`A form action's type is "plugin:name", got "${action.type}".`);
    claim(actions, action.type, action, 'action', pluginId);
}

export function registerFormField(field: PluginFormField, pluginId?: string): void {
    if (field.type.startsWith('core/'))
        throw new Error(`Core field types are checked by the engine: "${field.type}".`);
    claim(fields, field.type, field, 'field check', pluginId);
}

export function registerSubmissionScreen(screen: PluginSubmissionScreen, pluginId?: string): void {
    claim(screens, screen.id, screen, 'spam check', pluginId);
}

export function registerSubmissionHold(hold: PluginSubmissionHold, pluginId?: string): void {
    claim(holds, hold.id, hold, 'hold', pluginId);
}

export const getFormAction = (type: string) => actions.get(type);
export const getFormFieldCheck = (type: string) => fields.get(type);

/** Lists the plugin actions a form can use, with their labels, descriptions and settings. Admin clients use this to build the form action editor. */
export function listFormActions() {
    return [...actions.values()].map(({ type, label, description, settings }) => ({
        type,
        label,
        ...(description && { description }),
        settings: settings ?? {}
    }));
}

function within<T>(ms: number, work: Promise<T>, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        work,
        new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`${what} took longer than ${ms / 1000} s`)),
                ms
            );
        })
    ]).finally(() => clearTimeout(timer));
}

/** Runs one plugin action for one submission. It never throws: a failure is returned as the outcome. */
export async function runFormAction(
    type: string,
    projectId: string,
    form: FormSchema,
    submission: FormSubmission,
    config: Record<string, unknown> = {}
): Promise<FormActionOutcome> {
    const action = actions.get(type);
    if (!action) return { status: 'failed', error: `No plugin provides the action "${type}".` };
    try {
        const outcome = await within(
            ACTION_TIMEOUT_MS,
            action.run({ projectId, form, submission, config }),
            action.label
        );
        return outcome && outcome.status ? outcome : { status: 'success' };
    } catch (err) {
        return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
}

/** Returns the verdict of the first plugin spam check that flags the submission as spam, if any. Checks that are slow or fail are skipped. */
export async function screenWithPlugins(
    context: SubmissionScreenContext
): Promise<(SubmissionScreenVerdict & { by: string }) | undefined> {
    for (const screen of screens.values()) {
        try {
            const verdict = await within(SCREEN_TIMEOUT_MS, screen.screen(context), screen.id);
            if (verdict?.spam) return { ...verdict, by: screen.id };
        } catch (err) {
            console.warn(
                `[moteur] Spam check "${screen.id}" was skipped:`,
                err instanceof Error ? err.message : err
            );
        }
    }
    return undefined;
}

/** Returns the id of the first plugin that holds back the submission's actions, if any. A hold that fails does not hold the submission. */
export async function holdWithPlugins(
    projectId: string,
    form: FormSchema,
    submission: FormSubmission
): Promise<string | undefined> {
    for (const hold of holds.values()) {
        try {
            if (
                await within(SCREEN_TIMEOUT_MS, hold.hold({ projectId, form, submission }), hold.id)
            )
                return hold.id;
        } catch (err) {
            console.warn(
                `[moteur] Hold "${hold.id}" was skipped:`,
                err instanceof Error ? err.message : err
            );
        }
    }
    return undefined;
}

/** For tests: forget everything plugins registered. */
export function resetFormExtensions(): void {
    actions.clear();
    fields.clear();
    screens.clear();
    holds.clear();
}

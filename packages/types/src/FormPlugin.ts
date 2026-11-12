import type {
    FormField,
    FormIssueCode,
    FormSchema,
    FormSubmission,
    FormSubmissionMeta
} from './Form.js';

/**
 * Extension points that plugins can add to forms:
 * - Actions that run when a submission arrives, such as adding a row to a spreadsheet or a contact
 *   to a CRM.
 * - Field types whose submitted values the server validates.
 * - A spam check that runs after the engine's own checks.
 * - A hold that keeps a submission's actions waiting, for example for a double opt-in.
 */

/** One setting of a plugin action, which admin clients ask the user to fill in. */
export interface FormActionSetting {
    /** Field type of the setting: `core/text`, `core/url`, `core/email`, `core/boolean` or `core/select`. */
    type: string;
    label: string;
    description?: string;
    required?: boolean;
    /** The values offered when `type` is `core/select`. */
    choices?: string[];
    /** When true, the value is write-only (for example a token): it is stored but never returned. */
    secret?: boolean;
}

/** The result of running an action on one submission, stored in the submission's `actionResults`. */
export interface FormActionOutcome {
    status: 'success' | 'failed';
    /** Human-readable description of what the action did, for example "Row 42 added to Leads". */
    detail?: string;
    error?: string;
}

export interface FormActionContext {
    projectId: string;
    form: FormSchema;
    submission: FormSubmission;
    /** The form's settings for this action. */
    config: Record<string, unknown>;
}

export interface PluginFormAction {
    /** Action type, stored as `type` in a form's `actions`. Prefix it with the plugin name, for example `sheets:append`. */
    type: string;
    label: string;
    description?: string;
    /** The settings a form can configure for this action, keyed by setting name. */
    settings?: Record<string, FormActionSetting>;
    /** Validates the form's settings when the form is saved. Returns a message describing the problem, or nothing when the settings are valid. */
    check?(config: Record<string, unknown>): string | undefined | void;
    /** Runs the action for one submission. Throwing marks the action as failed without stopping the form's other actions. */
    run(context: FormActionContext): Promise<FormActionOutcome | void>;
}

/** The result of checking one submitted value: either the accepted value or an issue. */
export type FormFieldCheck =
    | { value: unknown }
    | { issue: { code: FormIssueCode; params?: Record<string, string | number> } };

export interface PluginFormField {
    /** The field type being checked, as registered with `registerFieldSchema`, for example `geo/location`. */
    type: string;
    /** Converts the value a visitor submitted into the value to store, or reports an issue. Runs on the server. */
    check(value: unknown, field: FormField): FormFieldCheck;
}

export interface SubmissionScreenContext {
    projectId: string;
    form: FormSchema;
    /** The submitted values, already validated against the form. */
    data: Record<string, unknown>;
    meta: FormSubmissionMeta;
}

export interface SubmissionScreenVerdict {
    spam?: boolean;
    /** Spam score from 0 (likely a person) to 1 (likely a bot), for checks that produce a score. */
    score?: number;
    /** Note stored with the submission for the team, for example "Akismet: spam". */
    note?: string;
}

export interface PluginSubmissionScreen {
    id: string;
    /** Runs after the honeypot, time trap and captcha checks. A check that is slow or fails is skipped. */
    screen(context: SubmissionScreenContext): Promise<SubmissionScreenVerdict | void>;
}

export interface SubmissionHoldContext {
    projectId: string;
    form: FormSchema;
    submission: FormSubmission;
}

export interface PluginSubmissionHold {
    id: string;
    /**
     * Returns true to hold the submission's actions. The submission stays `held` until the plugin
     * calls `releaseSubmission` or the submission is erased. If the hold throws, the submission
     * is not held.
     */
    hold(context: SubmissionHoldContext): Promise<boolean | void>;
}

import type {
    FormField,
    FormIssueCode,
    FormSchema,
    FormSubmission,
    FormSubmissionMeta
} from './Form.js';

/**
 * What plugins can add to forms: actions run when a letter arrives (a row in a sheet, a contact in
 * a CRM), field types whose answers the server checks, a spam check after the engine's own, and a
 * hold that keeps a letter's actions waiting (double opt-in).
 */

/** One setting of a plugin action, as the Studio asks for it. */
export interface FormActionSetting {
    /** core/text, core/url, core/email, core/boolean or core/select. */
    type: string;
    label: string;
    description?: string;
    required?: boolean;
    /** core/select: the values offered. */
    choices?: string[];
    /** Write-only (a token): stored, never shown back. */
    secret?: boolean;
}

/** What an action did with one letter, kept in its `actionResults`. */
export interface FormActionOutcome {
    status: 'success' | 'failed';
    /** For people: "Row 42 added to Leads". */
    detail?: string;
    error?: string;
}

export interface FormActionContext {
    projectId: string;
    form: FormSchema;
    submission: FormSubmission;
    /** This form's settings for the action. */
    config: Record<string, unknown>;
}

export interface PluginFormAction {
    /** Kept in a form's `actions` as `type`. Name it after the plugin: `sheets:append`. */
    type: string;
    label: string;
    description?: string;
    /** What a form sets for it, by key. */
    settings?: Record<string, FormActionSetting>;
    /** Checks a form's settings when it is saved: a sentence saying what's wrong, or nothing. */
    check?(config: Record<string, unknown>): string | undefined | void;
    /** Does the work for one letter. Throwing counts as failed; it never stops the others. */
    run(context: FormActionContext): Promise<FormActionOutcome | void>;
}

/** What a field check says about one answer. */
export type FormFieldCheck =
    | { value: unknown }
    | { issue: { code: FormIssueCode; params?: Record<string, string | number> } };

export interface PluginFormField {
    /** The field type it checks, as registered with registerFieldSchema: `geo/location`. */
    type: string;
    /** Turns what a visitor sent into the value kept, or says what's wrong. Runs on the server. */
    check(value: unknown, field: FormField): FormFieldCheck;
}

export interface SubmissionScreenContext {
    projectId: string;
    form: FormSchema;
    /** The answers, already checked against the form. */
    data: Record<string, unknown>;
    meta: FormSubmissionMeta;
}

export interface SubmissionScreenVerdict {
    spam?: boolean;
    /** 0 (a person) to 1 (a bot), when the check scores. */
    score?: number;
    /** Kept with the letter for the team: "Akismet: spam". */
    note?: string;
}

export interface PluginSubmissionScreen {
    id: string;
    /** Runs after the honeypot, the time trap and the captcha. A slow or failing check is skipped. */
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
     * Whether this letter's actions wait: true keeps it `held` until the plugin calls
     * releaseSubmission (or erases it). A failing hold lets the letter through.
     */
    hold(context: SubmissionHoldContext): Promise<boolean | void>;
}

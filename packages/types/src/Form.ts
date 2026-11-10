import type { FieldMeta } from './Field.js';

/** Strings keyed by locale code, for example `{ en: 'Submit', fr: 'Envoyer' }`. */
export type MultilingualString = Record<string, string>;

/** Text shown to a site visitor: a single string, or a map from locale code to string. */
export type FormText = string | MultilingualString;

/** Custom messages shown to the visitor when an answer is rejected, keyed by issue code. */
export type FormFieldMessages = Partial<Record<FormIssueCode, FormText>>;

/** An option of a select field: either the stored value alone, or the stored value with the label shown to the visitor. */
export type FormChoice = string | { value: string; label?: FormText };

/** A form field. It is like a model field, but its visitor-facing text can be given per locale. */
export interface FormField {
    id?: string;
    /** Field type, as in models, for example `core/text`, `core/email` or `core/select`. */
    type: string;
    label: FormText;
    description?: FormText;
    /** Hint shown below the field. */
    help?: FormText;
    placeholder?: FormText;
    /** Custom messages for rejected answers, keyed by issue code. */
    messages?: FormFieldMessages;
    meta?: FieldMeta;
    /** Field options such as `required`, `maxLength`, `min`, `max` and `choices`, as in models. */
    options?: Record<string, any>;
    [key: string]: any;
}

/** The reason the server rejected an answer. */
export type FormIssueCode =
    'required' | 'invalid' | 'too_long' | 'too_short' | 'too_small' | 'too_large' | 'choice';

/** A rejected answer, identified by field ID, with a message in the visitor's language. */
export interface FormIssue {
    field: string;
    code: FormIssueCode;
    message: string;
}

export type FormCaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha';

/**
 * A captcha that the server verifies. The secret key is not stored in the form. It is kept in the
 * project's secrets file, and the form only reports whether one is set.
 */
export interface FormCaptcha {
    provider: FormCaptchaProvider;
    siteKey: string;
    /** reCAPTCHA v3 only. Submissions scoring below this value are stored as spam. Defaults to 0.5. */
    minScore?: number;
    /** Read-only. True when a secret key is stored for this captcha. */
    secretSet?: boolean;
}

/**
 * Spam check based on how fast the form is submitted, since bots tend to submit immediately. The
 * site requests a token when it shows the form. A submission sent less than `minSeconds` after
 * the token was issued is stored as spam.
 */
export interface FormTimeTrap {
    /** Minimum number of seconds between showing and submitting the form. Defaults to 3. */
    minSeconds?: number;
    /** When true, submissions without a token are also treated as spam. Enable it only when every site that submits to the form sends a token. */
    required?: boolean;
}

export type FormStatus = 'active' | 'inactive' | 'archived';

export type FormActionCreateEntry = {
    type: 'createEntry';
    modelId: string;
    /** Maps form field IDs to model field IDs. A field with no mapping is copied to the model field with the same ID. */
    fieldMap?: Record<string, string>;
};

export type FormActionEmail = {
    type: 'email';
    to: string[];
    subject: string;
    body: string;
};

export type FormActionWebhook = {
    type: 'webhook';
};

/** An action added by a plugin (for example `sheets:append`), with this form's settings for it. */
export type FormActionPlugin = {
    type: `${string}:${string}`;
    config?: Record<string, unknown>;
};

export type FormAction =
    FormActionCreateEntry | FormActionEmail | FormActionWebhook | FormActionPlugin;

export interface FormNotifications {
    /** Addresses to notify when a submission arrives. */
    onSubmit?: { to: string[]; subject?: string };
    /** Confirmation email sent to the submitter. `fieldRef` is the ID of the form field that holds the submitter's email address. */
    confirmationEmail?: {
        fieldRef: string;
        subject?: string;
        body?: MultilingualString;
    };
}

export interface FormSchema {
    id: string;
    label: string;
    description?: string;
    fields: Record<string, FormField>;
    status: FormStatus;
    submitLabel?: MultilingualString;
    successMessage?: MultilingualString;
    redirectUrl?: string;
    honeypot?: boolean;
    captcha?: FormCaptcha;
    timeTrap?: FormTimeTrap;
    /** @deprecated Use `captcha`. Treated as a reCAPTCHA captcha, and its secret key is moved out of the form when the form is saved. */
    recaptcha?: { siteKey: string; secretKey?: string };
    actions?: FormAction[];
    notifications?: FormNotifications;
    createdAt: string;
    updatedAt: string;
}

export interface FormSubmissionMeta {
    submittedAt: string;
    ip?: string;
    userAgent?: string;
    locale?: string;
    /** The page the form was submitted from. */
    page?: string;
    /** The page the visitor came from before reaching the form's page. */
    referrer?: string;
    /** Campaign data taken from the page's `utm_*` parameters. */
    campaign?: {
        source?: string;
        medium?: string;
        campaign?: string;
        term?: string;
        content?: string;
    };
    honeypotTriggered?: boolean;
    recaptchaScore?: number;
    /** Why the submission was classified as spam when it arrived. */
    spamReason?: FormSpamReason;
    /** Seconds between the form being shown and submitted. Set only when the site sent a time-trap token. */
    fillSeconds?: number;
    /** True when the captcha provider could not be reached. The submission is kept without a captcha check. */
    captchaUnchecked?: boolean;
    /** The plugin check that classified the submission as spam, and the note it returned. */
    screenedBy?: string;
    screenNote?: string;
    /** The plugin holding the submission's actions (for example a double opt-in), while the status is `held`. */
    heldBy?: string;
}

export type FormSpamReason = 'honeypot' | 'too_fast' | 'no_token' | 'captcha_score' | 'screen';

/** Submission status. `held` means the submission is stored and its actions wait for a plugin to release it, for example after email confirmation. */
export type FormSubmissionStatus = 'received' | 'processed' | 'spam' | 'held';

export interface FormActionResult {
    type: string;
    status: 'success' | 'failed';
    error?: string;
    entryId?: string;
    /** Description of what a plugin action did, for example "Row 42 added to Leads". */
    detail?: string;
}

export interface FormSubmission {
    id: string;
    formId: string;
    projectId: string;
    data: Record<string, unknown>;
    metadata: FormSubmissionMeta;
    actionResults: FormActionResult[];
    status: FormSubmissionStatus;
    /** ISO 8601 timestamp of when a user first opened the submission. Absent while it is unread. */
    readAt?: string;
    readBy?: string;
    /** Set while the submission is manually marked as spam. Marking it as not spam restores this status. */
    statusBeforeSpam?: FormSubmissionStatus;
    /** ISO 8601 timestamp of when the submission became spam. Spam is deleted 30 days later. */
    spamAt?: string;
}

import type { FieldMeta } from './Field.js';

/** Locale-keyed strings for i18n (e.g. { en: 'Submit', fr: 'Envoyer' }). */
export type MultilingualString = Record<string, string>;

/** Text a visitor reads: one text, or one per language. */
export type FormText = string | MultilingualString;

/** What a visitor may be told when an answer doesn't fit, by issue code. */
export type FormFieldMessages = Partial<Record<FormIssueCode, FormText>>;

/** A choice of a select field: its stored value and what the visitor reads. */
export type FormChoice = string | { value: string; label?: FormText };

/** A form's field: a field whose words can be one per language. */
export interface FormField {
    id?: string;
    /** A field type, as in models: core/text, core/email, core/select… */
    type: string;
    label: FormText;
    description?: FormText;
    /** A hint shown under the field. */
    help?: FormText;
    placeholder?: FormText;
    /** Your own words for an answer that doesn't fit, by issue code. */
    messages?: FormFieldMessages;
    meta?: FieldMeta;
    /** required, maxLength, min, max, choices… as in models. */
    options?: Record<string, any>;
    [key: string]: any;
}

/** Why the server refused an answer. */
export type FormIssueCode =
    'required' | 'invalid' | 'too_long' | 'too_short' | 'too_small' | 'too_large' | 'choice';

/** One answer the server refused, by field id, worded in the visitor's language. */
export interface FormIssue {
    field: string;
    code: FormIssueCode;
    message: string;
}

export type FormCaptchaProvider = 'turnstile' | 'hcaptcha' | 'recaptcha';

/**
 * A captcha the server checks. The secret key is never in the form: it's kept in the project's
 * secrets file, and the form only says whether one is set.
 */
export interface FormCaptcha {
    provider: FormCaptchaProvider;
    siteKey: string;
    /** reCAPTCHA v3: answers scoring below this are kept as spam (default 0.5). */
    minScore?: number;
    /** Read only: a secret key is stored. */
    secretSet?: boolean;
}

/**
 * Bots fill a form in the instant they load it. A site asks for a token when it shows the form,
 * and an answer sent sooner than `minSeconds` after is kept as spam.
 */
export interface FormTimeTrap {
    /** Default 3. */
    minSeconds?: number;
    /** Answers without a token are spam too (only when every site sends one). */
    required?: boolean;
}

export type FormStatus = 'active' | 'inactive' | 'archived';

export type FormActionCreateEntry = {
    type: 'createEntry';
    modelId: string;
    /** formFieldId → modelFieldId; default 1:1 when key not present */
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

export type FormAction = FormActionCreateEntry | FormActionEmail | FormActionWebhook;

export interface FormNotifications {
    /** Email(s) to notify when a submission arrives */
    onSubmit?: { to: string[]; subject?: string };
    /** Confirmation email to submitter; fieldRef = form field id holding email */
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
    /** @deprecated Use `captcha`; read as a reCAPTCHA captcha, its secret moved out on save. */
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
    /** The page the form was sent from. */
    page?: string;
    /** Where the visitor came from before that page. */
    referrer?: string;
    /** The campaign, from the page's utm_* parameters. */
    campaign?: {
        source?: string;
        medium?: string;
        campaign?: string;
        term?: string;
        content?: string;
    };
    honeypotTriggered?: boolean;
    recaptchaScore?: number;
    /** Why it was kept as spam on arrival. */
    spamReason?: FormSpamReason;
    /** Seconds between the form being shown and sent, when the site sent a token. */
    fillSeconds?: number;
    /** The captcha provider couldn't be reached: kept, but not checked. */
    captchaUnchecked?: boolean;
}

export type FormSpamReason = 'honeypot' | 'too_fast' | 'no_token' | 'captcha_score';

export type FormSubmissionStatus = 'received' | 'processed' | 'spam';

export interface FormActionResult {
    type: string;
    status: 'success' | 'failed';
    error?: string;
    entryId?: string;
}

export interface FormSubmission {
    id: string;
    formId: string;
    projectId: string;
    data: Record<string, unknown>;
    metadata: FormSubmissionMeta;
    actionResults: FormActionResult[];
    status: FormSubmissionStatus;
    /** When someone in the Studio first opened it; absent while unread. */
    readAt?: string;
    readBy?: string;
    /** Set while marked spam by hand: what "not spam" puts back. */
    statusBeforeSpam?: FormSubmissionStatus;
    /** When it became spam: spam is deleted 30 days after. */
    spamAt?: string;
}

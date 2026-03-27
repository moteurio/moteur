import type { Field } from './Field.js';

/** Locale-keyed strings for i18n (e.g. { en: 'Submit', fr: 'Envoyer' }). */
export type MultilingualString = Record<string, string>;

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
    fields: Record<string, Field>;
    status: FormStatus;
    submitLabel?: MultilingualString;
    successMessage?: MultilingualString;
    redirectUrl?: string;
    honeypot?: boolean;
    recaptcha?: { siteKey: string; secretKey: string };
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
    honeypotTriggered?: boolean;
    recaptchaScore?: number;
}

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
}

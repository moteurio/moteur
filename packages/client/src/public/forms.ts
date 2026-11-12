import type { FormIssue, FormIssueCode } from '@moteurio/types';
import { MoteurApiError, type MoteurClient } from '../client.js';

/** A form as a site renders it. It has no actions, recipients or secrets. */
export type PublicForm = {
    id: string;
    label: string;
    description?: string;
    fields: Record<string, Record<string, unknown> & { type: string; label: unknown }>;
    submitLabel?: unknown;
    successMessage?: unknown;
    honeypot: boolean;
    redirectUrl?: string;
    /** The captcha widget to show: its provider and site key. */
    captcha?: { provider: 'turnstile' | 'hcaptcha' | 'recaptcha'; siteKey: string };
    timeTrap?: { minSeconds?: number; required?: boolean };
    /** Set when the form was requested for a single locale. All texts above are in that locale. */
    locale?: string;
};

export type FormSubmitOptions = {
    /** Locale of the confirmation message and of any issue messages. */
    locale?: string;
    /** Token from `forms.token()`, requested when the form was shown. */
    token?: string;
    /** The captcha widget's response. */
    captcha?: string;
    /** The page the form was submitted from, and the page the visitor came from before it. */
    page?: string;
    referrer?: string;
    /** The honeypot field is hidden from people and left empty by them. Send its value unchanged. */
    honeypot?: string;
};

export type FormSubmitResult =
    | { ok: true; submissionId: string; message: string; redirectUrl?: string }
    /** Some answers were rejected. Each issue message is in `locale`, and `message` summarizes them in one sentence. */
    | { ok: false; reason: 'answers'; message: string; issues: FormIssue[] }
    /** The captcha was not answered, or its provider rejected the answer. Show the captcha again. */
    | { ok: false; reason: 'captcha'; message: string };

export type { FormIssue, FormIssueCode };

/**
 * A project's forms as a site uses them. `submit` returns a result for every outcome a visitor
 * needs to see: a confirmation, answers to correct, or a captcha to answer again. Any other
 * failure throws a `MoteurApiError`, such as a form that is not found or not active, too many
 * submissions, or the server being down.
 */
export function publicFormsApi(client: MoteurClient, projectId: string) {
    const base = `/projects/${encodeURIComponent(projectId)}`;
    const form = (formId: string) => `${base}/forms/${encodeURIComponent(formId)}`;
    return {
        /** Fetches a form exposed by a channel, in a single locale when `locale` is given. */
        get(channelId: string, formId: string, options?: { locale?: string }): Promise<PublicForm> {
            return client.get(
                `${base}/channels/${encodeURIComponent(channelId)}/forms/${encodeURIComponent(formId)}`,
                options?.locale ? { locale: options.locale } : undefined
            );
        },
        /** Requests a token when the visitor is shown the form. Pass it back to `submit`. */
        async token(formId: string): Promise<string> {
            const res = await client.get<{ token: string }>(`${form(formId)}/token`);
            return res.token;
        },
        async submit(
            formId: string,
            answers: Record<string, unknown>,
            options?: FormSubmitOptions
        ): Promise<FormSubmitResult> {
            const body: Record<string, unknown> = { ...answers };
            if (options?.locale) body._locale = options.locale;
            if (options?.token) body._token = options.token;
            if (options?.captcha) body._captcha = options.captcha;
            if (options?.page) body._page = options.page;
            if (options?.referrer) body._referrer = options.referrer;
            if (options?.honeypot) body._honeypot = options.honeypot;
            try {
                const res = await client.post<{
                    submissionId: string;
                    message: string;
                    redirectUrl?: string;
                }>(`${form(formId)}/submit`, body);
                return {
                    ok: true,
                    submissionId: res.submissionId,
                    message: res.message,
                    ...(res.redirectUrl && { redirectUrl: res.redirectUrl })
                };
            } catch (err) {
                if (!(err instanceof MoteurApiError)) throw err;
                const message = typeof err.data?.error === 'string' ? err.data.error : err.message;
                if (err.code === 'ANSWERS_INVALID')
                    return {
                        ok: false,
                        reason: 'answers',
                        message,
                        issues: Array.isArray(err.data?.issues)
                            ? (err.data.issues as FormIssue[])
                            : []
                    };
                if (err.code === 'CAPTCHA_FAILED') return { ok: false, reason: 'captcha', message };
                throw err;
            }
        }
    };
}

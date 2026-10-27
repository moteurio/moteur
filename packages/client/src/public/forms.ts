import type { FormIssue, FormIssueCode } from '@moteurio/types';
import { MoteurApiError, type MoteurClient } from '../client.js';

/** A form as a site renders it: no actions, recipients or secrets. */
export type PublicForm = {
    id: string;
    label: string;
    description?: string;
    fields: Record<string, Record<string, unknown> & { type: string; label: unknown }>;
    submitLabel?: unknown;
    successMessage?: unknown;
    honeypot: boolean;
    redirectUrl?: string;
    /** The widget to show: its provider and site key. */
    captcha?: { provider: 'turnstile' | 'hcaptcha' | 'recaptcha'; siteKey: string };
    timeTrap?: { minSeconds?: number; required?: boolean };
    /** Set when asked for one language: every text above is in it. */
    locale?: string;
};

export type FormSubmitOptions = {
    /** The language of the thank-you and of any issue. */
    locale?: string;
    /** From `forms.token()`, asked for when the form was shown. */
    token?: string;
    /** The captcha widget's answer. */
    captcha?: string;
    /** The page the form was sent from, and where the visitor came from before it. */
    page?: string;
    referrer?: string;
    /** What a person never fills in: send the hidden field's value as is. */
    honeypot?: string;
};

export type FormSubmitResult =
    | { ok: true; submissionId: string; message: string; redirectUrl?: string }
    /** Answers to fix, each worded in `locale`; `message` names them in one sentence. */
    | { ok: false; reason: 'answers'; message: string; issues: FormIssue[] }
    /** The captcha wasn't answered, or its provider refused the answer: show it again. */
    | { ok: false; reason: 'captcha'; message: string };

export type { FormIssue, FormIssueCode };

/**
 * A project's forms, as a site uses them. `submit` answers what a visitor needs to see: a
 * thank-you, the answers to fix, or the captcha to answer again. Anything else still throws a
 * MoteurApiError (form not found or not active, too many sends, server down).
 */
export function publicFormsApi(client: MoteurClient, projectId: string) {
    const base = `/projects/${encodeURIComponent(projectId)}`;
    const form = (formId: string) => `${base}/forms/${encodeURIComponent(formId)}`;
    return {
        /** A form exposed by a collection, in one language when `locale` is given. */
        get(
            collectionId: string,
            formId: string,
            options?: { locale?: string }
        ): Promise<PublicForm> {
            return client.get(
                `${base}/collections/${encodeURIComponent(collectionId)}/forms/${encodeURIComponent(formId)}`,
                options?.locale ? { locale: options.locale } : undefined
            );
        },
        /** Ask for one when the visitor sees the form; send it back with `submit`. */
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

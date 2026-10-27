import crypto from 'crypto';
import type { FormCaptchaProvider, FormSchema, FormSubmissionMeta } from '@moteurio/types/Form.js';
import { projectDir } from './utils/pathUtils.js';
import { readSecretsFile, updateSecretsSection } from './utils/secretsFile.js';
import { encryptSecret, decryptSecret } from './webhooks/secretEncryption.js';
import { postWebhook } from './webhooks/outboundHttp.js';
import { screenWithPlugins } from './plugins/formExtensions.js';

/**
 * What keeps bots out of a form besides the honeypot: a signed token that says when the form was
 * shown (bots send in the instant they load it), and a captcha the server checks with its provider.
 * The key that signs tokens and each form's captcha secret live in `.moteur/secrets.json`, section
 * `forms`, never in the form file that Git keeps.
 */

const SECTION = 'forms';
/** A token older than this says nothing: the page was left open, or it was copied. */
const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;
export const DEFAULT_MIN_SECONDS = 3;

type FormsSecrets = { tokenKey?: string; captcha?: Record<string, string> };

function readSection(projectId: string): FormsSecrets {
    const stored = readSecretsFile(projectDir(projectId))[SECTION];
    return stored && typeof stored === 'object' ? (stored as FormsSecrets) : {};
}

function writeSection(projectId: string, section: FormsSecrets): void {
    const empty = !section.tokenKey && !Object.keys(section.captcha ?? {}).length;
    updateSecretsSection(projectDir(projectId), SECTION, empty ? undefined : section);
}

/** The project's token key, made the first time a form asks for one. */
function tokenKey(projectId: string): string {
    const section = readSection(projectId);
    if (section.tokenKey) return decryptSecret(section.tokenKey);
    const key = crypto.randomBytes(32).toString('hex');
    writeSection(projectId, { ...section, tokenKey: encryptSecret(key) });
    return key;
}

const sign = (key: string, projectId: string, formId: string, issuedAt: number) =>
    crypto
        .createHmac('sha256', key)
        .update(`${projectId}:${formId}:${issuedAt}`)
        .digest('base64url');

/** A token for a form shown now: when it was shown, signed. */
export function issueFormToken(projectId: string, formId: string, now = Date.now()): string {
    return `${now}.${sign(tokenKey(projectId), projectId, formId, now)}`;
}

/**
 * How many seconds ago the form was shown, from its token. `undefined` for a token that isn't
 * this form's, was tampered with, or is too old to say anything.
 */
export function formTokenAge(
    projectId: string,
    formId: string,
    token: unknown,
    now = Date.now()
): number | undefined {
    if (typeof token !== 'string') return undefined;
    const match = /^(\d{10,16})\.([\w-]{20,100})$/.exec(token.trim());
    if (!match) return undefined;
    const issuedAt = Number(match[1]);
    const expected = Buffer.from(sign(tokenKey(projectId), projectId, formId, issuedAt));
    const given = Buffer.from(match[2]);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected))
        return undefined;
    const seconds = (now - issuedAt) / 1000;
    // A clock a little behind is fine; a token from the future isn't.
    if (seconds < -5 || seconds > TOKEN_LIFETIME_SECONDS) return undefined;
    return Math.max(0, Math.round(seconds * 10) / 10);
}

/** The form's captcha secret, if one is stored (or still in an old form file). */
export function captchaSecret(projectId: string, form: FormSchema): string | undefined {
    const stored = readSection(projectId).captcha?.[form.id];
    if (stored) return decryptSecret(stored);
    return form.recaptcha?.secretKey || undefined;
}

export function hasStoredCaptchaSecret(projectId: string, formId: string): boolean {
    return Boolean(readSection(projectId).captcha?.[formId]);
}

/** Keep (or with `null`, forget) a form's captcha secret. */
export function setCaptchaSecret(projectId: string, formId: string, secret: string | null): void {
    const section = readSection(projectId);
    const captcha = { ...section.captcha };
    if (secret) captcha[formId] = encryptSecret(secret);
    else delete captcha[formId];
    writeSection(projectId, { ...section, captcha });
}

/** The form's captcha, read from `captcha` or the older `recaptcha` setting. */
export function formCaptcha(
    form: FormSchema
): { provider: FormCaptchaProvider; siteKey: string; minScore?: number } | undefined {
    if (form.captcha?.provider && form.captcha.siteKey) return form.captcha;
    if (form.recaptcha?.siteKey) return { provider: 'recaptcha', siteKey: form.recaptcha.siteKey };
    return undefined;
}

const VERIFY_URL: Record<FormCaptchaProvider, string> = {
    turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    hcaptcha: 'https://api.hcaptcha.com/siteverify',
    recaptcha: 'https://www.google.com/recaptcha/api/siteverify'
};

/** Where each provider's widget puts its answer in the form it sits in. */
export const CAPTCHA_FIELDS = [
    'cf-turnstile-response',
    'h-captcha-response',
    'g-recaptcha-response',
    '_captcha'
];

/** The captcha answer a visitor sent, whichever widget put it there. */
export function sentCaptcha(body: Record<string, unknown>): string | undefined {
    for (const key of CAPTCHA_FIELDS) {
        const value = body[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
}

export type CaptchaCheck =
    /** The provider says it's a person (reCAPTCHA v3: with this score). */
    | { outcome: 'passed'; score?: number }
    /** No answer, or the provider refused it: the visitor is asked to try again. */
    | { outcome: 'failed'; reason: string }
    /** reCAPTCHA v3 scored it below the form's minimum: kept as spam. */
    | { outcome: 'low_score'; score: number }
    /** The provider couldn't be asked: kept, and marked as not checked. */
    | { outcome: 'unchecked'; reason: string };

/** Ask the form's captcha provider about the answer the visitor sent. */
export async function checkCaptcha(
    projectId: string,
    form: FormSchema,
    response: string | undefined,
    ip?: string
): Promise<CaptchaCheck | undefined> {
    const captcha = formCaptcha(form);
    if (!captcha) return undefined;
    const secret = captchaSecret(projectId, form);
    // Set up without its secret: nothing to check with. The Studio says so.
    if (!secret) return undefined;
    if (!response) return { outcome: 'failed', reason: 'missing-input-response' };

    const body = new URLSearchParams({ secret, response });
    if (ip) body.set('remoteip', ip);
    if (captcha.provider === 'hcaptcha') body.set('sitekey', captcha.siteKey);
    let answer: { success?: boolean; score?: number; 'error-codes'?: string[] };
    try {
        const res = await postWebhook(
            VERIFY_URL[captcha.provider],
            { 'Content-Type': 'application/x-www-form-urlencoded' },
            body.toString(),
            5_000,
            64 * 1024
        );
        if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
        answer = JSON.parse(res.body);
    } catch (err) {
        return { outcome: 'unchecked', reason: err instanceof Error ? err.message : String(err) };
    }
    if (!answer.success)
        return { outcome: 'failed', reason: answer['error-codes']?.join(', ') || 'refused' };
    const score = typeof answer.score === 'number' ? answer.score : undefined;
    if (score !== undefined && score < (captcha.minScore ?? 0.5))
        return { outcome: 'low_score', score };
    return { outcome: 'passed', ...(score !== undefined && { score }) };
}

/** What a visitor reads when the captcha wasn't answered. */
export function captchaMessage(locale?: string): string {
    return locale?.toLowerCase().startsWith('fr')
        ? 'Confirmez que vous n’êtes pas un robot, puis envoyez de nouveau.'
        : 'Please confirm you’re not a robot, then send again.';
}

/** What a visitor sends besides the answers that tells a person from a bot. */
export type SubmissionProof = {
    /** The site filled in the hidden field nobody sees. */
    honeypotTriggered?: boolean;
    /** The token the site asked for when it showed the form. */
    token?: unknown;
    /** The captcha widget's answer. */
    captcha?: string;
    ip?: string;
};

export type Screening = Pick<
    FormSubmissionMeta,
    | 'spamReason'
    | 'fillSeconds'
    | 'recaptchaScore'
    | 'captchaUnchecked'
    | 'screenedBy'
    | 'screenNote'
>;

/**
 * Decide whether a submission is spam, in order of cost: the honeypot, the time trap, then the
 * captcha. Spam is kept quietly, so a bot learns nothing. A captcha that wasn't answered throws
 * (400 CAPTCHA_FAILED): a person can answer it and send again.
 */
export async function screenSubmission(
    projectId: string,
    form: FormSchema,
    proof: SubmissionProof,
    locale?: string,
    now = Date.now(),
    /** The checked answers and what came with them, for the plugins' spam checks. */
    letter?: { data: Record<string, unknown>; meta: FormSubmissionMeta }
): Promise<Screening> {
    if (proof.honeypotTriggered && form.honeypot !== false) return { spamReason: 'honeypot' };

    const out: Screening = {};
    const age = formTokenAge(projectId, form.id, proof.token, now);
    if (age !== undefined) out.fillSeconds = age;
    const trap = form.timeTrap;
    if (age !== undefined && age < (trap?.minSeconds ?? DEFAULT_MIN_SECONDS))
        return { ...out, spamReason: 'too_fast' };
    if (age === undefined && trap?.required) return { spamReason: 'no_token' };

    const check = await checkCaptcha(projectId, form, proof.captcha, proof.ip);
    if (check?.outcome === 'failed')
        throw Object.assign(new Error(captchaMessage(locale)), {
            statusCode: 400,
            code: 'CAPTCHA_FAILED',
            reason: check.reason
        });
    if (check?.outcome === 'low_score')
        return { ...out, recaptchaScore: check.score, spamReason: 'captcha_score' };
    if (check?.outcome === 'unchecked') out.captchaUnchecked = true;
    if (check?.outcome === 'passed' && check.score !== undefined) out.recaptchaScore = check.score;

    // Last, the plugins' own checks (Akismet…), on answers that already fit the form.
    if (letter) {
        const verdict = await screenWithPlugins({ projectId, form, ...letter });
        if (verdict)
            return {
                ...out,
                spamReason: 'screen',
                screenedBy: verdict.by,
                ...(verdict.note && { screenNote: verdict.note.slice(0, 200) })
            };
    }
    return out;
}

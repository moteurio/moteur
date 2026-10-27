import type { FormField, FormIssue, FormIssueCode, FormSchema } from '@moteurio/types/Form.js';
import { issueMessage } from './formText.js';

export { answersMessage, fieldLabel } from './formText.js';

/** One answer the server refused, by field id, with a code a site can turn into its own words. */
export type AnswerIssue = FormIssue;

/** Longest answer kept for a field without its own `maxLength`. */
const TEXT_LIMIT = { short: 1_000, long: 10_000 };
const LONG_TEXT = new Set(['core/textarea', 'core/markdown', 'core/rich-text', 'core/html']);
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE = /^\+?[0-9 ().-]{4,30}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;
const TRUE = new Set(['true', 'on', 'yes', '1']);
const FALSE = new Set(['false', 'off', 'no', '0']);

/** The values a choice field allows: plain strings, or `{ value, label }` objects. */
function choiceValues(field: FormField): string[] | undefined {
    const choices = field.options?.choices ?? field.options?.options;
    if (!Array.isArray(choices)) return undefined;
    return choices
        .map(c =>
            typeof c === 'string' || typeof c === 'number'
                ? String(c)
                : c && typeof c === 'object' && 'value' in c
                  ? String((c as { value: unknown }).value)
                  : undefined
        )
        .filter((v): v is string => v !== undefined);
}

const isEmpty = (v: unknown) =>
    v === undefined ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0);

/** A form posted as text sends one value as a string and several as a list. */
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);

type Problem = {
    code: FormIssueCode;
    params?: Record<string, string | number>;
    /** Narrower words than the code's: not text at all, several answers for one. */
    detail?: 'text' | 'one';
};
type Checked = { value?: unknown; issue?: Problem };

function checkText(value: unknown, field: FormField, long: boolean): Checked {
    if (typeof value !== 'string' && typeof value !== 'number')
        return { issue: { code: 'invalid', detail: 'text' } };
    const text = String(value).trim();
    const max = Number(field.options?.maxLength) || (long ? TEXT_LIMIT.long : TEXT_LIMIT.short);
    const min = Number(field.options?.minLength) || 0;
    if (text.length > max) return { issue: { code: 'too_long', params: { max } } };
    if (text.length < min) return { issue: { code: 'too_short', params: { min } } };
    return { value: text };
}

function checkOne(value: unknown, field: FormField): Checked {
    const type = field.type;
    if (type === 'core/email') {
        const text = typeof value === 'string' ? value.trim() : '';
        return text.length <= 254 && EMAIL.test(text)
            ? { value: text }
            : { issue: { code: 'invalid' } };
    }
    if (type === 'core/url') {
        const text = typeof value === 'string' ? value.trim() : '';
        try {
            const url = new URL(text);
            if (/^https?:$/.test(url.protocol) && text.length <= 2_000) return { value: text };
        } catch {
            // falls through
        }
        return { issue: { code: 'invalid' } };
    }
    if (type === 'core/phone') {
        const text = typeof value === 'string' ? value.trim() : String(value ?? '');
        return PHONE.test(text) ? { value: text } : { issue: { code: 'invalid' } };
    }
    if (type === 'core/number') {
        const n = typeof value === 'number' ? value : Number(String(value).trim());
        if (typeof value === 'boolean' || !Number.isFinite(n))
            return { issue: { code: 'invalid' } };
        const { min, max } = field.options ?? {};
        if (typeof min === 'number' && n < min)
            return { issue: { code: 'too_small', params: { min } } };
        if (typeof max === 'number' && n > max)
            return { issue: { code: 'too_large', params: { max } } };
        return { value: n };
    }
    if (type === 'core/boolean') {
        if (typeof value === 'boolean') return { value };
        const text = String(value).trim().toLowerCase();
        if (TRUE.has(text)) return { value: true };
        if (FALSE.has(text)) return { value: false };
        return { issue: { code: 'invalid' } };
    }
    if (type === 'core/date' || type === 'core/datetime' || type === 'core/time') {
        const text = typeof value === 'string' ? value.trim() : '';
        const ok =
            type === 'core/time'
                ? TIME.test(text)
                : type === 'core/date'
                  ? DATE.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
                  : text.length <= 40 && !Number.isNaN(Date.parse(text));
        return ok ? { value: text } : { issue: { code: 'invalid' } };
    }
    if (type === 'core/address') {
        if (typeof value === 'string') return checkText(value, field, false);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const entries = Object.entries(value as Record<string, unknown>);
            if (
                entries.length <= 12 &&
                entries.every(([, v]) => typeof v === 'string' && v.length <= 500)
            )
                return {
                    value: Object.fromEntries(entries.map(([k, v]) => [k, String(v).trim()]))
                };
        }
        return { issue: { code: 'invalid' } };
    }
    return checkText(value, field, LONG_TEXT.has(type));
}

/**
 * Check what a visitor sent against the form, as the server sees it: what the browser checked
 * can't be trusted. Keeps only the form's fields, turns text into numbers and yes-or-no where the
 * field says so, and lists every answer to fix. Never throws.
 */
export function checkAnswers(
    form: Pick<FormSchema, 'fields'>,
    sent: Record<string, unknown>,
    locale?: string
): { data: Record<string, unknown>; issues: AnswerIssue[] } {
    const data: Record<string, unknown> = {};
    const issues: AnswerIssue[] = [];
    // Worded in the visitor's language, or in the field's own words.
    const refuse = (id: string, { code, params, detail }: Problem) =>
        issues.push({
            field: id,
            code,
            message: issueMessage(form.fields?.[id], code, locale, params, detail)
        });
    const fields = Object.entries(form.fields ?? {});
    // A form that declares no fields takes any answers, as text, within limits.
    if (fields.length === 0) {
        for (const [id, raw] of Object.entries(sent).slice(0, 50)) {
            if (isEmpty(raw) || !/^[\w.-]{1,100}$/.test(id)) continue;
            const { value } = checkText(raw, { type: 'core/textarea', label: id }, true);
            if (value !== undefined) data[id] = value;
        }
        return { data, issues };
    }
    for (const [id, field] of fields) {
        const raw = sent[id];
        const required = field.options?.required === true;
        // An unticked box sends nothing: that's a "no", unless the form needs a "yes".
        if (field.type === 'core/boolean' && isEmpty(raw)) {
            if (required) refuse(id, { code: 'required' });
            else data[id] = false;
            continue;
        }
        if (isEmpty(raw)) {
            if (required) refuse(id, { code: 'required' });
            continue;
        }

        const choices =
            field.type === 'core/select' || field.type === 'core/multi-select'
                ? choiceValues(field)
                : undefined;
        if (choices) {
            const many = field.type === 'core/multi-select' || field.options?.multiple === true;
            const picked = asList(raw).map(v => String(v).trim());
            if ((!many && picked.length > 1) || picked.some(v => !choices.includes(v))) {
                refuse(id, { code: 'choice' });
                continue;
            }
            data[id] = many ? picked : picked[0];
            continue;
        }

        if (Array.isArray(raw)) {
            refuse(id, { code: 'invalid', detail: 'one' });
            continue;
        }
        const { value, issue } = checkOne(raw, field);
        if (issue) refuse(id, issue);
        else if (field.type === 'core/boolean' && required && value === false)
            refuse(id, { code: 'required' });
        else data[id] = value;
    }
    return { data, issues };
}

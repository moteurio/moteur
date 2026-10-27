import type { Field } from '@moteurio/types/Field.js';
import type { FormSchema } from '@moteurio/types/Form.js';

/** One answer the server refused, by field id, with a code a site can turn into its own words. */
export type AnswerIssue = {
    field: string;
    code: 'required' | 'invalid' | 'too_long' | 'too_short' | 'too_small' | 'too_large' | 'choice';
    message: string;
};

/** Longest answer kept for a field without its own `maxLength`. */
const TEXT_LIMIT = { short: 1_000, long: 10_000 };
const LONG_TEXT = new Set(['core/textarea', 'core/markdown', 'core/rich-text', 'core/html']);
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE = /^\+?[0-9 ().-]{4,30}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;
const TRUE = new Set(['true', 'on', 'yes', '1']);
const FALSE = new Set(['false', 'off', 'no', '0']);

/** A field's label in the visitor's language (labels may be one text per language). */
export function fieldLabel(field: Field, id: string, locale?: string): string {
    const label = field.label as unknown;
    if (typeof label === 'string' && label) return label;
    if (label && typeof label === 'object') {
        const map = label as Record<string, unknown>;
        const pick = (locale && map[locale]) || Object.values(map).find(v => typeof v === 'string');
        if (typeof pick === 'string' && pick) return pick;
    }
    return id;
}

/** The values a choice field allows: plain strings, or `{ value }` objects. */
function choiceValues(field: Field): string[] | undefined {
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

type Checked = { value?: unknown; issue?: Omit<AnswerIssue, 'field'> };

function checkText(value: unknown, field: Field, long: boolean): Checked {
    if (typeof value !== 'string' && typeof value !== 'number')
        return { issue: { code: 'invalid', message: 'must be text' } };
    const text = String(value).trim();
    const max = Number(field.options?.maxLength) || (long ? TEXT_LIMIT.long : TEXT_LIMIT.short);
    const min = Number(field.options?.minLength) || 0;
    if (text.length > max)
        return { issue: { code: 'too_long', message: `must be at most ${max} characters` } };
    if (text.length < min)
        return { issue: { code: 'too_short', message: `must be at least ${min} characters` } };
    return { value: text };
}

function checkOne(value: unknown, field: Field): Checked {
    const type = field.type;
    if (type === 'core/email') {
        const text = typeof value === 'string' ? value.trim() : '';
        return text.length <= 254 && EMAIL.test(text)
            ? { value: text }
            : { issue: { code: 'invalid', message: 'must be an email address' } };
    }
    if (type === 'core/url') {
        const text = typeof value === 'string' ? value.trim() : '';
        try {
            const url = new URL(text);
            if (/^https?:$/.test(url.protocol) && text.length <= 2_000) return { value: text };
        } catch {
            // falls through
        }
        return { issue: { code: 'invalid', message: 'must be a web address (https://…)' } };
    }
    if (type === 'core/phone') {
        const text = typeof value === 'string' ? value.trim() : String(value ?? '');
        return PHONE.test(text)
            ? { value: text }
            : { issue: { code: 'invalid', message: 'must be a phone number' } };
    }
    if (type === 'core/number') {
        const n = typeof value === 'number' ? value : Number(String(value).trim());
        if (typeof value === 'boolean' || !Number.isFinite(n))
            return { issue: { code: 'invalid', message: 'must be a number' } };
        const { min, max } = field.options ?? {};
        if (typeof min === 'number' && n < min)
            return { issue: { code: 'too_small', message: `must be at least ${min}` } };
        if (typeof max === 'number' && n > max)
            return { issue: { code: 'too_large', message: `must be at most ${max}` } };
        return { value: n };
    }
    if (type === 'core/boolean') {
        if (typeof value === 'boolean') return { value };
        const text = String(value).trim().toLowerCase();
        if (TRUE.has(text)) return { value: true };
        if (FALSE.has(text)) return { value: false };
        return { issue: { code: 'invalid', message: 'must be yes or no' } };
    }
    if (type === 'core/date' || type === 'core/datetime' || type === 'core/time') {
        const text = typeof value === 'string' ? value.trim() : '';
        const ok =
            type === 'core/time'
                ? TIME.test(text)
                : type === 'core/date'
                  ? DATE.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
                  : text.length <= 40 && !Number.isNaN(Date.parse(text));
        return ok
            ? { value: text }
            : {
                  issue: {
                      code: 'invalid',
                      message:
                          type === 'core/time' ? 'must be a time' : 'must be a date (YYYY-MM-DD)'
                  }
              };
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
        return { issue: { code: 'invalid', message: 'must be an address' } };
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
    sent: Record<string, unknown>
): { data: Record<string, unknown>; issues: AnswerIssue[] } {
    const data: Record<string, unknown> = {};
    const issues: AnswerIssue[] = [];
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
            if (required) issues.push({ field: id, code: 'required', message: 'is required' });
            else data[id] = false;
            continue;
        }
        if (isEmpty(raw)) {
            if (required) issues.push({ field: id, code: 'required', message: 'is required' });
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
                issues.push({ field: id, code: 'choice', message: 'must be one of the choices' });
                continue;
            }
            data[id] = many ? picked : picked[0];
            continue;
        }

        if (Array.isArray(raw)) {
            issues.push({ field: id, code: 'invalid', message: 'must be one answer' });
            continue;
        }
        const { value, issue } = checkOne(raw, field);
        if (issue) issues.push({ field: id, ...issue });
        else if (field.type === 'core/boolean' && required && value === false)
            issues.push({ field: id, code: 'required', message: 'is required' });
        else data[id] = value;
    }
    return { data, issues };
}

/** A sentence for the visitor, naming the fields to fix in their language. */
export function answersMessage(
    form: Pick<FormSchema, 'fields'>,
    issues: AnswerIssue[],
    locale?: string
): string {
    const names = [...new Set(issues.map(i => fieldLabel(form.fields[i.field], i.field, locale)))];
    return locale?.toLowerCase().startsWith('fr')
        ? `Vérifiez ${names.length > 1 ? 'ces réponses' : 'cette réponse'}\u202f: ${names.join(', ')}.`
        : `Please check ${names.length > 1 ? 'these answers' : 'this answer'}: ${names.join(', ')}.`;
}

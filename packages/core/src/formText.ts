import type { FormField, FormIssueCode, FormSchema } from '@moteurio/types/Form.js';

/**
 * A form's words in the visitor's language. Labels, hints, choices and error messages may be one
 * text or one per language; this picks the visitor's (fr-CA reads fr), else the first one written.
 */
export function formText(text: unknown, locale?: string): string | undefined {
    if (typeof text === 'string') return text || undefined;
    if (!text || typeof text !== 'object' || Array.isArray(text)) return undefined;
    const map = text as Record<string, unknown>;
    const lang = locale?.toLowerCase().split(/[-_]/)[0];
    const pick =
        (locale && map[locale]) ||
        (lang &&
            Object.entries(map).find(([k]) => k.toLowerCase().split(/[-_]/)[0] === lang)?.[1]) ||
        Object.values(map).find(v => typeof v === 'string' && v);
    return typeof pick === 'string' && pick ? pick : undefined;
}

/** A field's label in the visitor's language, or its id. */
export function fieldLabel(
    field: Pick<FormField, 'label'> | undefined,
    id: string,
    locale?: string
) {
    return formText(field?.label, locale) ?? id;
}

type Params = Record<string, string | number>;

/** The engine's own words for each issue, in the languages it speaks. */
const ISSUE_WORDS: Record<string, Record<FormIssueCode | 'text' | 'one', string>> = {
    en: {
        required: 'is required',
        invalid: 'is not valid',
        too_long: 'must be at most {max} characters',
        too_short: 'must be at least {min} characters',
        too_small: 'must be at least {min}',
        too_large: 'must be at most {max}',
        choice: 'must be one of the choices',
        text: 'must be text',
        one: 'must be one answer'
    },
    fr: {
        required: 'est obligatoire',
        invalid: 'n’est pas valide',
        too_long: 'doit faire au plus {max} caractères',
        too_short: 'doit faire au moins {min} caractères',
        too_small: 'doit être d’au moins {min}',
        too_large: 'doit être d’au plus {max}',
        choice: 'doit être l’un des choix',
        text: 'doit être du texte',
        one: 'doit être une seule réponse'
    }
};

/** What `invalid` means for each kind of field. */
const INVALID_WORDS: Record<string, Record<string, string>> = {
    en: {
        'core/email': 'must be an email address',
        'core/url': 'must be a web address (https://…)',
        'core/phone': 'must be a phone number',
        'core/number': 'must be a number',
        'core/boolean': 'must be yes or no',
        'core/date': 'must be a date (YYYY-MM-DD)',
        'core/datetime': 'must be a date (YYYY-MM-DD)',
        'core/time': 'must be a time',
        'core/address': 'must be an address'
    },
    fr: {
        'core/email': 'doit être une adresse courriel',
        'core/url': 'doit être une adresse web (https://…)',
        'core/phone': 'doit être un numéro de téléphone',
        'core/number': 'doit être un nombre',
        'core/boolean': 'doit être oui ou non',
        'core/date': 'doit être une date (AAAA-MM-JJ)',
        'core/datetime': 'doit être une date (AAAA-MM-JJ)',
        'core/time': 'doit être une heure',
        'core/address': 'doit être une adresse'
    }
};

const language = (locale?: string) => {
    const lang = locale?.toLowerCase().split(/[-_]/)[0];
    return lang && ISSUE_WORDS[lang] ? lang : 'en';
};

const fill = (text: string, params?: Params) =>
    text.replace(/\{(\w+)\}/g, (m, key: string) => (params?.[key] ?? m).toString());

/**
 * The words for one issue: the field's own (`messages`), else the engine's in the visitor's
 * language. `detail` narrows a generic code (`text`, `one`) the engine words more precisely.
 */
export function issueMessage(
    field: FormField | undefined,
    code: FormIssueCode,
    locale?: string,
    params?: Params,
    detail?: 'text' | 'one'
): string {
    const own = formText(field?.messages?.[code], locale);
    if (own) return fill(own, params);
    const lang = language(locale);
    if (code === 'invalid' && !detail && field && INVALID_WORDS[lang][field.type])
        return INVALID_WORDS[lang][field.type];
    return fill(ISSUE_WORDS[lang][detail ?? code], params);
}

/** A sentence for the visitor, naming the fields to fix in their language. */
export function answersMessage(
    form: Pick<FormSchema, 'fields'>,
    issues: { field: string }[],
    locale?: string
): string {
    const names = [
        ...new Set(issues.map(i => fieldLabel(form.fields?.[i.field], i.field, locale)))
    ];
    return language(locale) === 'fr'
        ? `Vérifiez ${names.length > 1 ? 'ces réponses' : 'cette réponse'}\u202f: ${names.join(', ')}.`
        : `Please check ${names.length > 1 ? 'these answers' : 'this answer'}: ${names.join(', ')}.`;
}

const TEXT_KEYS = ['label', 'description', 'help', 'placeholder'] as const;

/** A choice as `{ value, label }`, its label in the visitor's language. */
function localChoice(choice: unknown, locale?: string): unknown {
    if (!choice || typeof choice !== 'object' || !('value' in choice)) return choice;
    const c = choice as { value: unknown; label?: unknown };
    return { ...c, label: formText(c.label, locale) ?? String(c.value) };
}

/**
 * The form's fields with every text in one language: what a site renders as is. The answer
 * check stays on the server; `messages` comes along so a site can say the same thing before.
 */
export function localizeFields(
    fields: Record<string, FormField>,
    locale: string
): Record<string, FormField> {
    return Object.fromEntries(
        Object.entries(fields).map(([id, field]) => {
            const out: FormField = { ...field };
            for (const key of TEXT_KEYS) {
                const text = formText(field[key], locale);
                if (text !== undefined) out[key] = text;
                else delete out[key];
            }
            if (!out.label) out.label = id;
            if (field.messages)
                out.messages = Object.fromEntries(
                    Object.entries(field.messages)
                        .map(([code, text]) => [code, formText(text, locale)])
                        .filter(([, text]) => text)
                );
            const choices = field.options?.choices ?? field.options?.options;
            if (Array.isArray(choices)) {
                const key = field.options?.choices ? 'choices' : 'options';
                out.options = { ...field.options, [key]: choices.map(c => localChoice(c, locale)) };
            }
            return [id, out];
        })
    );
}

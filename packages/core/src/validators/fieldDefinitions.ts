/**
 * A schema's field definitions, checked when the schema is saved (models, templates, blocks,
 * structures, forms): every option a field is given is one its type has (a type this server
 * doesn't have, a plugin's, is left alone). An option a type doesn't have used to be stored without a word, and did nothing
 * (`allowedBlocks` for `allowedBlockTypes`): now it's refused, with the option meant if it's close.
 */
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import fieldRegistry from '../registry/FieldRegistry.js';

/** Options every field may have, whatever its type. */
const EVERY_FIELD = new Set(['required', 'multilingual', 'ui']);

type FieldLike = {
    type?: unknown;
    options?: Record<string, unknown>;
    fields?: Record<string, FieldLike>;
    items?: FieldLike;
};

/** Edits from a to b, for "did you mean". */
function distance(a: string, b: string): number {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0]![j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            d[i]![j] = Math.min(
                d[i - 1]![j]! + 1,
                d[i]![j - 1]! + 1,
                d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
    return d[a.length]![b.length]!;
}

/** The option this one is probably meant to be: close in spelling, or one contains the other. */
function closest(option: string, known: string[]): string | undefined {
    const lower = option.toLowerCase();
    const scored = known
        .map(k => {
            const kl = k.toLowerCase();
            const score = kl.includes(lower) || lower.includes(kl) ? 0 : distance(lower, kl);
            return { k, score };
        })
        .sort((a, b) => a.score - b.score);
    const best = scored[0];
    return best && best.score <= Math.max(2, Math.floor(option.length / 3)) ? best.k : undefined;
}

/** Every problem with these field definitions, found all at once. */
export function fieldDefinitionIssues(
    fields: Record<string, FieldLike> | undefined,
    prefix = 'fields'
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const walk = (field: FieldLike, path: string) => {
        if (!field || typeof field !== 'object') return;
        const type = typeof field.type === 'string' ? field.type : undefined;
        // A type this server doesn't have (a plugin's, not installed here) can't be checked: its
        // options are its own.
        if (type && fieldRegistry.has(type)) {
            const own = Object.keys(fieldRegistry.get(type).optionsSchema ?? {});
            for (const option of Object.keys(field.options ?? {})) {
                if (EVERY_FIELD.has(option) || own.includes(option)) continue;
                const meant = closest(option, [...own, ...EVERY_FIELD]);
                issues.push({
                    type: 'error',
                    code: 'FIELD_OPTION_UNKNOWN',
                    message:
                        `"${path}" (${type}) has no option "${option}"` +
                        (meant
                            ? `: did you mean "${meant}"?`
                            : own.length
                              ? ` (its options: ${own.join(', ')}).`
                              : '.'),
                    path: `${path}.options.${option}`
                });
            }
        }
        for (const [key, sub] of Object.entries(field.fields ?? {}))
            walk(sub, `${path}.fields.${key}`);
        if (field.items) walk(field.items, `${path}.items`);
        // A map's value is a field too.
        const value = field.options?.value as FieldLike | undefined;
        if (type === 'core/map' && value && typeof value === 'object')
            walk(value, `${path}.options.value`);
        const variants = field.options?.variants;
        if (variants && typeof variants === 'object')
            for (const [kind, v] of Object.entries(
                variants as Record<string, { fields?: Record<string, FieldLike> }>
            ))
                for (const [key, sub] of Object.entries(v?.fields ?? {}))
                    walk(sub, `${path}.options.variants.${kind}.fields.${key}`);
    };
    for (const [key, field] of Object.entries(fields ?? {})) walk(field, `${prefix}.${key}`);
    return issues;
}

/** Refuses a schema whose fields have problems (400), saying them all. */
export function assertFieldDefinitions(
    fields: Record<string, FieldLike> | undefined,
    what: string
): void {
    const issues = fieldDefinitionIssues(fields);
    if (!issues.length) return;
    throw Object.assign(new Error(`${what}: ${issues.map(i => i.message).join(' ')}`), {
        status: 400,
        statusCode: 400,
        code: issues[0]!.code,
        issues
    });
}

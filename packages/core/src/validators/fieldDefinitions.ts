/**
 * Checks a schema's field definitions when the schema is saved (models, templates, blocks,
 * structures and forms). Every option on a field must be an option its type has. Fields whose type
 * this server does not have, such as a plugin's, are not checked. An unknown option is rejected,
 * and the message suggests the intended option when one is close (for example `allowedBlocks`
 * instead of `allowedBlockTypes`), because an unknown option would otherwise be stored and silently
 * do nothing.
 */
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import fieldRegistry from '../registry/FieldRegistry.js';

/** Options that every field may have, whatever its type. */
const EVERY_FIELD = new Set(['required', 'multilingual', 'ui']);

/** The property that sits beside `type` instead of inside `options`: a list's `items` and an object's `fields`. */
const BESIDE_TYPE: Record<string, string> = {
    'core/list': 'items',
    'core/object': 'fields'
};

type FieldLike = {
    type?: unknown;
    options?: Record<string, unknown>;
    fields?: Record<string, FieldLike>;
    items?: FieldLike;
};

/** The edit distance between two strings, used for "did you mean" suggestions. */
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

/** Returns the known option this one was probably meant to be: one that is close in spelling, or that contains it or is contained by it. */
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

/** Returns every problem in these field definitions, all at once. */
export function fieldDefinitionIssues(
    fields: Record<string, FieldLike> | undefined,
    prefix = 'fields'
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const walk = (field: FieldLike, path: string) => {
        if (!field || typeof field !== 'object') return;
        const type = typeof field.type === 'string' ? field.type : undefined;
        // Skip a type this server does not have, such as a plugin's field type that is not
        // installed here. Its options cannot be checked.
        if (type && fieldRegistry.has(type)) {
            const own = Object.keys(fieldRegistry.get(type).optionsSchema ?? {});
            for (const option of Object.keys(field.options ?? {})) {
                if (EVERY_FIELD.has(option) || own.includes(option)) continue;
                if (BESIDE_TYPE[type] === option) {
                    issues.push({
                        type: 'error',
                        code: 'FIELD_OPTION_UNKNOWN',
                        message: `"${path}" (${type}): "${option}" goes beside "type", not in "options".`,
                        path: `${path}.options.${option}`
                    });
                    continue;
                }
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
        // The value of a map is itself a field definition.
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

/** Throws a 400 error that lists every problem if the schema's fields have any. */
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

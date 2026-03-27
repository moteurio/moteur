import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function hasImage(value: unknown): boolean {
    if (value == null || typeof value !== 'object') return false;
    const o = value as Record<string, unknown>;
    const src = o.src ?? o.value;
    return (
        (typeof src === 'string' && src.trim() !== '') || (typeof src === 'object' && src !== null)
    );
}

export const missingCover: RuleEvaluator = ({ entry, model }) => {
    const coverKey = Object.entries(model.fields).find(
        ([key, def]) =>
            def?.type === 'core/image' &&
            (key.toLowerCase() === 'cover' || key.toLowerCase() === 'hero')
    )?.[0];
    if (!coverKey) return [];
    const value = entry.data[coverKey];
    if (hasImage(value)) return [];
    return [
        {
            id: makeViolationId('missing-cover', entry.slug, coverKey),
            ruleId: 'missing-cover',
            severity: 'suggestion',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: coverKey,
            message: 'Entry has no cover image.',
            hint: 'Add a cover or hero image.',
            detectedAt: new Date().toISOString()
        }
    ];
};

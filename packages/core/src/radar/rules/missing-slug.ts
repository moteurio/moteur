import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

export const missingSlug: RuleEvaluator = ({ entry, model }) => {
    const slugFieldKey = Object.entries(model.fields).find(
        ([, def]) => def?.type === 'core/slug'
    )?.[0];
    if (!slugFieldKey) return [];
    const value = entry.data[slugFieldKey];
    const empty =
        value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
    if (!empty) return [];
    return [
        {
            id: makeViolationId('missing-slug', entry.slug, slugFieldKey),
            ruleId: 'missing-slug',
            severity: 'error',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: slugFieldKey,
            message: 'Entry has no slug value.',
            hint: 'Set the slug field.',
            detectedAt: new Date().toISOString()
        }
    ];
};

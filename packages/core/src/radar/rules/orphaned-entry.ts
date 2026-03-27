import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

export const orphanedEntry: RuleEvaluator = ({ entry, model, graph }) => {
    const refs = graph.referrers.get(entry.slug);
    if (refs && refs.length > 0) return [];
    return [
        {
            id: makeViolationId('orphaned-entry', entry.slug),
            ruleId: 'orphaned-entry',
            severity: 'suggestion',
            entrySlug: entry.slug,
            modelSlug: model.id,
            message: 'No other entry links to this entry.',
            hint: 'Consider linking from another entry or removing if unused.',
            detectedAt: new Date().toISOString()
        }
    ];
};

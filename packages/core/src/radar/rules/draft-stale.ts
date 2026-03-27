import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

const DRAFT_STALE_DAYS = 30;

export const draftStale: RuleEvaluator = ({ entry }) => {
    const status = entry.status ?? 'draft';
    if (status !== 'draft') return [];
    const updatedAt = entry.meta?.audit?.updatedAt;
    if (!updatedAt) return [];
    const updated = new Date(updatedAt).getTime();
    const threshold = Date.now() - DRAFT_STALE_DAYS * 24 * 60 * 60 * 1000;
    if (updated > threshold) return [];
    return [
        {
            id: makeViolationId('draft-stale', entry.slug),
            ruleId: 'draft-stale',
            severity: 'warning',
            entrySlug: entry.slug,
            modelSlug: entry.modelId,
            message: `Entry has been in draft for more than ${DRAFT_STALE_DAYS} days without being updated.`,
            hint: 'Publish, update, or archive this entry.',
            detectedAt: new Date().toISOString()
        }
    ];
};

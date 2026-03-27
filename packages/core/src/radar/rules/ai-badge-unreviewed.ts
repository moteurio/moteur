import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

const UNREVIEWED_DAYS = 7;

/** Check if a field has AI badge (e.g. data._aiGenerated?.[fieldKey] or similar). */
function hasAIBadge(_entry: { data: Record<string, unknown> }, _fieldKey: string): boolean {
    // V1: we don't have a standard AI badge field; assume we check options or a convention.
    // If entry.data has _aiGenerated as object with field keys, use that.
    const data = _entry.data as Record<string, unknown> & {
        _aiGenerated?: Record<string, unknown>;
    };
    const badge = data?._aiGenerated;
    if (badge && typeof badge === 'object' && _fieldKey in badge) return true;
    return false;
}

export const aiBadgeUnreviewed: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    const updatedAt = entry.meta?.audit?.updatedAt;
    if (!updatedAt) return [];
    const updated = new Date(updatedAt).getTime();
    const threshold = Date.now() - UNREVIEWED_DAYS * 24 * 60 * 60 * 1000;
    if (updated > threshold) return []; // was updated recently

    for (const [fieldKey] of Object.entries(model.fields)) {
        if (!hasAIBadge(entry, fieldKey)) continue;
        violations.push({
            id: makeViolationId('ai-badge-unreviewed', entry.slug, fieldKey),
            ruleId: 'ai-badge-unreviewed',
            severity: 'suggestion',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: fieldKey,
            message: `AI-generated content in "${fieldKey}" has not been reviewed for over ${UNREVIEWED_DAYS} days.`,
            hint: 'Review and edit the AI-generated content.',
            detectedAt: now
        });
    }
    return violations;
};

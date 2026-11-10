import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

const UNREVIEWED_DAYS = 7;

/** Whether the field is marked as AI generated in `data._aiGenerated`. */
function hasAIBadge(_entry: { data: Record<string, unknown> }, _fieldKey: string): boolean {
    // There is no standard AI badge field yet, so rely on the convention that
    // `entry.data._aiGenerated` is an object with the generated field keys.
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
    if (updated > threshold) return []; // Updated recently, so it is not overdue for review yet.

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

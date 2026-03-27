import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function getRelationRefIds(value: unknown): string[] {
    if (value == null) return [];
    if (typeof value === 'object' && value !== null && 'id' in value) {
        const id = (value as { id: string }).id;
        return typeof id === 'string' && id.trim() !== '' ? [id] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap(item => getRelationRefIds(item));
    }
    return [];
}

export const relationPointsToDraft: RuleEvaluator = ({ entry, model, graph }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        const type = fieldDef?.type;
        if (type !== 'core/relation' && type !== 'core/relations') continue;
        const value = entry.data[fieldKey];
        const refIds = getRelationRefIds(value);
        for (const refId of refIds) {
            const target = graph.entries.get(refId);
            if (target && (target.status === 'draft' || !target.status)) {
                violations.push({
                    id: makeViolationId(
                        'relation-points-to-draft',
                        entry.slug,
                        `${fieldKey}:${refId}`
                    ),
                    ruleId: 'relation-points-to-draft',
                    severity: 'warning',
                    entrySlug: entry.slug,
                    modelSlug: model.id,
                    fieldPath: fieldKey,
                    message: `Relation points to an entry that is not published (${refId}).`,
                    hint: 'Publish the target entry or choose a published one.',
                    detectedAt: now
                });
            }
        }
    }
    return violations;
};

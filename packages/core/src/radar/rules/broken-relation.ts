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

export const brokenRelation: RuleEvaluator = ({ entry, model, graph }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        const type = fieldDef?.type;
        if (type !== 'core/relation' && type !== 'core/relations') continue;
        const value = entry.data[fieldKey];
        const refIds = getRelationRefIds(value);
        for (const refId of refIds) {
            if (refId === entry.slug) continue; // self-reference handled by relation-self-reference rule
            const targetExists = graph.entries.has(refId);
            if (!targetExists) {
                violations.push({
                    id: makeViolationId('broken-relation', entry.slug, `${fieldKey}:${refId}`),
                    ruleId: 'broken-relation',
                    severity: 'error',
                    entrySlug: entry.slug,
                    modelSlug: model.id,
                    fieldPath: fieldKey,
                    message: `Relation points to an entry that does not exist (${refId}).`,
                    hint: 'Remove the reference or create the target entry.',
                    detectedAt: now
                });
            }
        }
    }
    return violations;
};

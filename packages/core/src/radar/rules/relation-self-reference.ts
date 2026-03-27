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

export const relationSelfReference: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        const type = fieldDef?.type;
        if (type !== 'core/relation' && type !== 'core/relations') continue;
        const value = entry.data[fieldKey];
        const refIds = getRelationRefIds(value);
        if (refIds.includes(entry.slug)) {
            violations.push({
                id: makeViolationId('relation-self-reference', entry.slug, fieldKey),
                ruleId: 'relation-self-reference',
                severity: 'error',
                entrySlug: entry.slug,
                modelSlug: model.id,
                fieldPath: fieldKey,
                message: 'Relation points to the entry itself.',
                hint: 'Choose a different entry or leave empty.',
                detectedAt: now
            });
        }
    }
    return violations;
};

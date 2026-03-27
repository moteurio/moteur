import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

export const requiredFieldEmpty: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        const required =
            fieldDef?.options && (fieldDef.options as { required?: boolean }).required === true;
        if (!required) continue;
        const value = entry.data[fieldKey];
        const empty = value === undefined || value === null || value === '';
        if (empty) {
            violations.push({
                id: makeViolationId('required-field-empty', entry.slug, fieldKey),
                ruleId: 'required-field-empty',
                severity: 'error',
                entrySlug: entry.slug,
                modelSlug: model.id,
                fieldPath: fieldKey,
                message: `Required field "${fieldKey}" is empty.`,
                hint: 'Provide a value for this field.',
                detectedAt: now
            });
        }
    }
    return violations;
};

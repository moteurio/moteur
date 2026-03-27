import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function hasImageNoAlt(value: unknown): boolean {
    if (value == null || typeof value !== 'object') return false;
    const o = value as Record<string, unknown>;
    const src = o.src ?? o.value;
    const hasSrc =
        (typeof src === 'string' && src.trim() !== '') || (typeof src === 'object' && src !== null);
    const alt =
        o.alt ??
        (o.value && typeof o.value === 'object' && (o.value as Record<string, unknown>).alt);
    const altEmpty =
        alt === undefined ||
        alt === null ||
        (typeof alt === 'string' && (alt as string).trim() === '');
    return !!hasSrc && altEmpty;
}

export const missingAltText: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        if (fieldDef?.type !== 'core/image') continue;
        const value = entry.data[fieldKey];
        if (hasImageNoAlt(value)) {
            violations.push({
                id: makeViolationId('missing-alt-text', entry.slug, `${fieldKey}.alt`),
                ruleId: 'missing-alt-text',
                severity: 'warning',
                entrySlug: entry.slug,
                modelSlug: model.id,
                fieldPath: `${fieldKey}.alt`,
                message: 'Image has no alt text.',
                hint: 'Add alt text for accessibility.',
                aiAction: {
                    feature: 'image-analysis',
                    label: '✦ Analyse',
                    action: 'analyse'
                },
                detectedAt: now
            });
        }
    }
    return violations;
};

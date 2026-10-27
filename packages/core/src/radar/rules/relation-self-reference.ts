import type { RuleEvaluator } from './types.js';
import type { RadarViolation } from '@moteurio/types/Radar.js';
import { makeViolationId } from '../violationId.js';
import { entryRelations } from './relations.js';

export const relationSelfReference: RuleEvaluator = ctx => {
    const { entry, model } = ctx;
    const violations: RadarViolation[] = [];
    const now = new Date().toISOString();
    const paths = new Set(
        entryRelations(ctx)
            .filter(r => r.id === entry.slug)
            .map(r => r.path)
    );
    for (const path of paths) {
        violations.push({
            id: makeViolationId('relation-self-reference', entry.slug, path),
            ruleId: 'relation-self-reference',
            severity: 'error',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: path,
            message: 'Relation points to the entry itself.',
            hint: 'Choose a different entry or leave empty.',
            detectedAt: now
        });
    }
    return violations;
};

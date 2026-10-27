import type { RuleEvaluator } from './types.js';
import type { RadarViolation } from '@moteurio/types/Radar.js';
import { makeViolationId } from '../violationId.js';
import { entryRelations } from './relations.js';

export const brokenRelation: RuleEvaluator = ctx => {
    const { entry, model, graph } = ctx;
    const violations: RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const { path, id: refId } of entryRelations(ctx)) {
        if (refId === entry.slug) continue; // self-reference handled by relation-self-reference rule
        if (graph.entries.has(refId)) continue;
        violations.push({
            id: makeViolationId('broken-relation', entry.slug, `${path}:${refId}`),
            ruleId: 'broken-relation',
            severity: 'error',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: path,
            message: `Relation points to an entry that does not exist (${refId}).`,
            hint: 'Remove the reference or create the target entry.',
            detectedAt: now
        });
    }
    return violations;
};

import type { RuleEvaluator } from './types.js';
import type { RadarViolation } from '@moteurio/types/Radar.js';
import { makeViolationId } from '../violationId.js';
import { entryRelations } from './relations.js';

export const relationPointsToDraft: RuleEvaluator = ctx => {
    const { entry, model, graph } = ctx;
    const violations: RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const { path, id: refId } of entryRelations(ctx)) {
        const target = graph.entries.get(refId);
        if (!target || (target.status && target.status !== 'draft')) continue;
        violations.push({
            id: makeViolationId('relation-points-to-draft', entry.slug, `${path}:${refId}`),
            ruleId: 'relation-points-to-draft',
            severity: 'warning',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: path,
            message: `Relation points to an entry that is not published (${refId}).`,
            hint: 'Publish the target entry or choose a published one.',
            detectedAt: now
        });
    }
    return violations;
};

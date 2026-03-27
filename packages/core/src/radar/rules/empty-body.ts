import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function blockCount(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'object' && 'content' in value) {
        const content = (value as { content: unknown }).content;
        if (content && typeof content === 'object' && 'blocks' in content) {
            const blocks = (content as { blocks: unknown }).blocks;
            return Array.isArray(blocks) ? blocks.length : 0;
        }
        if (
            content &&
            typeof content === 'object' &&
            Array.isArray((content as { value?: unknown }).value)
        ) {
            return (content as { value: unknown[] }).value.length;
        }
    }
    return 0;
}

export const emptyBody: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        if (fieldDef?.type !== 'core/structure') continue;
        const value = entry.data[fieldKey];
        const count = blockCount(value);
        if (count === 0) {
            violations.push({
                id: makeViolationId('empty-body', entry.slug, fieldKey),
                ruleId: 'empty-body',
                severity: 'warning',
                entrySlug: entry.slug,
                modelSlug: model.id,
                fieldPath: fieldKey,
                message: 'This body field has no blocks.',
                hint: 'Add at least one block.',
                detectedAt: now
            });
        }
    }
    return violations;
};

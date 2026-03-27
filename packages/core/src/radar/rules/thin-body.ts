import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

const MIN_BLOCKS = 3;

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

export const thinBody: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        if (fieldDef?.type !== 'core/structure') continue;
        const value = entry.data[fieldKey];
        const count = blockCount(value);
        if (count > 0 && count < MIN_BLOCKS) {
            violations.push({
                id: makeViolationId('thin-body', entry.slug, fieldKey),
                ruleId: 'thin-body',
                severity: 'suggestion',
                entrySlug: entry.slug,
                modelSlug: model.id,
                fieldPath: fieldKey,
                message: `Body has fewer than ${MIN_BLOCKS} blocks (${count}).`,
                hint: 'Consider adding more content.',
                detectedAt: now
            });
        }
    }
    return violations;
};

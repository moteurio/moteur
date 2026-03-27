import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function collectEmptyRequiredInStructure(
    content: unknown,
    schemaFields: Record<string, { type?: string; options?: Record<string, unknown> }> | undefined,
    pathPrefix: string
): { path: string; fieldKey: string }[] {
    const out: { path: string; fieldKey: string }[] = [];
    if (!content || typeof content !== 'object' || !schemaFields) return out;
    const obj = content as Record<string, unknown>;
    for (const [k, def] of Object.entries(schemaFields)) {
        const required = (def?.options as { required?: boolean })?.required === true;
        const val = obj[k];
        const empty =
            val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
        if (required && empty) {
            out.push({ path: `${pathPrefix}.${k}`, fieldKey: k });
        }
    }
    return out;
}

export const emptyBlockRequiredField: RuleEvaluator = ({ entry, model }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        if (fieldDef?.type !== 'core/structure') continue;
        const value = entry.data[fieldKey];
        const content =
            value && typeof value === 'object' && 'content' in value
                ? (value as { content: unknown }).content
                : null;
        const inlineSchema = (
            fieldDef.options as {
                inlineSchema?: {
                    fields?: Record<string, { type?: string; options?: Record<string, unknown> }>;
                };
            }
        )?.inlineSchema;
        const schemaFields = inlineSchema?.fields;
        const emptyPaths = collectEmptyRequiredInStructure(content, schemaFields, fieldKey);
        for (const { path } of emptyPaths) {
            violations.push({
                id: makeViolationId('empty-block-required-field', entry.slug, path),
                ruleId: 'empty-block-required-field',
                severity: 'error',
                entrySlug: entry.slug,
                modelSlug: model.id,
                fieldPath: path,
                message: `A required sub-field in this block is empty.`,
                hint: 'Fill the required field in the block.',
                detectedAt: now
            });
        }
    }
    return violations;
};

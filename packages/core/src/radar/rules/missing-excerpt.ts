import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function hasBodyContent(
    entry: { data: Record<string, unknown> },
    model: { fields: Record<string, { type?: string }> }
): boolean {
    const bodyKey = Object.entries(model.fields).find(
        ([, def]) => def?.type === 'core/structure'
    )?.[0];
    if (!bodyKey) return false;
    const value = entry.data[bodyKey];
    if (value == null) return false;
    if (typeof value === 'object' && 'content' in value) {
        const content = (value as { content: unknown }).content;
        if (content && typeof content === 'object' && 'blocks' in content) {
            return (
                Array.isArray((content as { blocks: unknown[] }).blocks) &&
                (content as { blocks: unknown[] }).blocks.length > 0
            );
        }
    }
    return false;
}

export const missingExcerpt: RuleEvaluator = ({ entry, model }) => {
    if (!hasBodyContent(entry, model)) return [];
    const excerptKey = Object.entries(model.fields).find(
        ([k]) => k.toLowerCase() === 'excerpt'
    )?.[0];
    if (!excerptKey) return [];
    const value = entry.data[excerptKey];
    const empty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && (value as string).trim() === '');
    if (!empty) return [];
    return [
        {
            id: makeViolationId('missing-excerpt', entry.slug, excerptKey),
            ruleId: 'missing-excerpt',
            severity: 'suggestion',
            entrySlug: entry.slug,
            modelSlug: model.id,
            fieldPath: excerptKey,
            message: 'Entry has a body but no excerpt.',
            hint: 'Add a short excerpt for previews.',
            aiEnhancement: {
                label: '✦ Check excerpt quality',
                description: 'AI will check whether the excerpt summarises the body.',
                credits: 2,
                action: 'radar.check:excerpt-quality'
            },
            detectedAt: new Date().toISOString()
        }
    ];
};

import type { RuleEvaluator, RadarRuleContext } from './types.js';
import { makeViolationId } from '../violationId.js';

const STALE_HOURS = 24;

function getUpdatedAt(entry: RadarRuleContext['entry'], _locale?: string): string | undefined {
    const audit = entry.meta?.audit;
    if (audit?.updatedAt) return audit.updatedAt;
    return undefined;
}

function isMultilingual(options: Record<string, unknown> | undefined): boolean {
    return (options?.multilingual as boolean) === true;
}

/** Compare source vs target locale updatedAt; if we don't have per-locale audit we use entry-level. */
export const staleTranslation: RuleEvaluator = ({ entry, model, locales }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    const defaultLocale = locales[0];
    if (!defaultLocale || locales.length <= 1) return [];

    const sourceUpdated = getUpdatedAt(entry);
    if (!sourceUpdated) return [];

    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        if (!isMultilingual((fieldDef?.options as Record<string, unknown>) ?? {})) continue;
        const value = entry.data[fieldKey];
        if (
            value == null ||
            (typeof value === 'object' && Object.keys(value as object).length === 0)
        )
            continue;
        const valObj =
            typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
        for (const loc of locales) {
            if (loc === defaultLocale) continue;
            const targetVal = valObj?.[loc];
            const targetEmpty =
                targetVal === undefined ||
                targetVal === null ||
                (typeof targetVal === 'string' && (targetVal as string).trim() === '');
            if (targetEmpty) continue;
            const sourceVal = valObj?.[defaultLocale];
            const sourceEmpty = sourceVal === undefined || sourceVal === null;
            if (sourceEmpty) continue;
            const sourceDate = new Date(sourceUpdated).getTime();
            const threshold = sourceDate - STALE_HOURS * 60 * 60 * 1000;
            const targetUpdated = getUpdatedAt(entry, loc);
            const targetDate = targetUpdated ? new Date(targetUpdated).getTime() : 0;
            if (targetDate < threshold) {
                violations.push({
                    id: makeViolationId('stale-translation', entry.slug, fieldKey, loc),
                    ruleId: 'stale-translation',
                    severity: 'warning',
                    entrySlug: entry.slug,
                    modelSlug: model.id,
                    fieldPath: fieldKey,
                    locale: loc,
                    message: `${loc} translation may be stale (source updated more than ${STALE_HOURS}h ago).`,
                    hint: 'Update the translation or run AI Translate.',
                    aiAction: {
                        feature: 'translation',
                        label: `✦ Translate to ${loc}`,
                        action: `translate:${loc}`
                    },
                    aiEnhancement: {
                        label: '✦ Check translation quality',
                        description: 'AI will review the translation for naturalness and tone.',
                        credits: 2,
                        action: `radar.check:translation-quality:${loc}`
                    },
                    detectedAt: now
                });
            }
        }
    }
    return violations;
};

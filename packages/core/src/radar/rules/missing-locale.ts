import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

function isMultilingual(options: Record<string, unknown> | undefined): boolean {
    return (options?.multilingual as boolean) === true;
}

export const missingLocale: RuleEvaluator = ({ entry, model, locales }) => {
    const violations: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    const now = new Date().toISOString();
    const defaultLocale = locales[0];
    if (!defaultLocale || locales.length <= 1) return [];

    for (const [fieldKey, fieldDef] of Object.entries(model.fields)) {
        if (!isMultilingual((fieldDef?.options as Record<string, unknown>) ?? {})) continue;
        const value = entry.data[fieldKey];
        const valObj =
            typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
        const sourceVal = defaultLocale ? valObj?.[defaultLocale] : undefined;
        const sourceFilled =
            sourceVal !== undefined &&
            sourceVal !== null &&
            (typeof sourceVal !== 'string' || (sourceVal as string).trim() !== '');
        if (!sourceFilled) continue;
        for (const loc of locales) {
            if (loc === defaultLocale) continue;
            const targetVal = valObj?.[loc];
            const targetEmpty =
                targetVal === undefined ||
                targetVal === null ||
                (typeof targetVal === 'string' && (targetVal as string).trim() === '');
            if (targetEmpty) {
                violations.push({
                    id: makeViolationId('missing-locale', entry.slug, fieldKey, loc),
                    ruleId: 'missing-locale',
                    severity: 'warning',
                    entrySlug: entry.slug,
                    modelSlug: model.id,
                    fieldPath: fieldKey,
                    locale: loc,
                    message: `Default locale has a value but ${loc} is empty.`,
                    hint: 'Add a translation for this locale.',
                    aiAction: {
                        feature: 'translation',
                        label: `✦ Translate to ${loc}`,
                        action: `translate:${loc}`
                    },
                    detectedAt: now
                });
            }
        }
    }
    return violations;
};

import type { RuleEvaluator } from './types.js';
import { requiredFieldEmpty } from './required-field-empty.js';
import { brokenRelation } from './broken-relation.js';
import { missingSlug } from './missing-slug.js';
import { emptyBlockRequiredField } from './empty-block-required-field.js';
import { relationSelfReference } from './relation-self-reference.js';
import { staleTranslation } from './stale-translation.js';
import { missingLocale } from './missing-locale.js';
import { relationPointsToDraft } from './relation-points-to-draft.js';
import { missingAltText } from './missing-alt-text.js';
import { emptyBody } from './empty-body.js';
import { draftStale } from './draft-stale.js';
import { orphanedEntry } from './orphaned-entry.js';
import { thinBody } from './thin-body.js';
import { missingExcerpt } from './missing-excerpt.js';
import { missingCover } from './missing-cover.js';
import { aiBadgeUnreviewed } from './ai-badge-unreviewed.js';

const BASE_RULES: RuleEvaluator[] = [
    requiredFieldEmpty,
    brokenRelation,
    missingSlug,
    emptyBlockRequiredField,
    relationSelfReference,
    staleTranslation,
    missingLocale,
    relationPointsToDraft,
    missingAltText,
    emptyBody,
    draftStale,
    orphanedEntry,
    thinBody,
    missingExcerpt,
    missingCover,
    aiBadgeUnreviewed
];

export function runAllRules(
    ctx: import('./types.js').RadarRuleContext
): import('@moteurio/types/Radar.js').RadarViolation[] {
    const out: import('@moteurio/types/Radar.js').RadarViolation[] = [];
    for (const rule of BASE_RULES) {
        out.push(...rule(ctx));
    }
    return out;
}

export {
    requiredFieldEmpty,
    brokenRelation,
    missingSlug,
    emptyBlockRequiredField,
    relationSelfReference
};
export {
    staleTranslation,
    missingLocale,
    relationPointsToDraft,
    missingAltText,
    emptyBody,
    draftStale
};
export { orphanedEntry, thinBody, missingExcerpt, missingCover, aiBadgeUnreviewed };

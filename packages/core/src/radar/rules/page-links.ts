import type { RadarGraph, RadarViolation } from '@moteurio/types/Radar.js';
import type { RuleEvaluator } from './types.js';
import { makeViolationId } from '../violationId.js';

/** Radar's name for the "model" of a violation found on a page. */
export const PAGES_MODEL_SLUG = 'pages';

/**
 * Links and relations to pages, from one record (an entry or a page) or from all of them:
 * an error when the page is gone (or is a folder), a warning when it is not published.
 */
export function pageLinkViolations(
    graph: RadarGraph,
    from?: { kind: 'entry' | 'page'; id: string }
): RadarViolation[] {
    if (!graph.pages || !graph.references) return [];
    const now = new Date().toISOString();
    const out: RadarViolation[] = [];
    for (const ref of graph.references) {
        if (ref.to.kind !== 'page') continue;
        if (from && (ref.from.kind !== from.kind || ref.from.id !== from.id)) continue;
        const page = graph.pages.get(ref.to.id);
        const what = ref.via === 'link' ? 'Link' : 'Relation';
        const modelSlug = ref.from.kind === 'page' ? PAGES_MODEL_SLUG : (ref.from.modelId ?? '');
        const base = { entrySlug: ref.from.id, modelSlug, fieldPath: ref.path, detectedAt: now };
        if (!page || page.type === 'folder') {
            out.push({
                ...base,
                id: makeViolationId('broken-page-link', ref.from.id, `${ref.path}:${ref.to.id}`),
                ruleId: 'broken-page-link',
                severity: 'error',
                message: `${what} points to a page that does not exist (${ref.to.id}).`,
                hint: 'Choose another page, or link to an address instead.'
            });
        } else if (page.status !== 'published') {
            out.push({
                ...base,
                id: makeViolationId('page-link-to-draft', ref.from.id, `${ref.path}:${ref.to.id}`),
                ruleId: 'page-link-to-draft',
                severity: 'warning',
                message: `${what} points to a page that is not published (${page.label}).`,
                hint: 'Publish the page, or readers will not see this link.'
            });
        }
    }
    return out;
}

/** The entry's links to pages (pages themselves are checked by the scan). */
export const pageLinks: RuleEvaluator = ({ entry, graph }) =>
    pageLinkViolations(graph, { kind: 'entry', id: entry.slug });

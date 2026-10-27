import type { FormSubmissionMeta } from '@moteurio/types/Form.js';

const CAMPAIGN_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;

/** An http(s) address without its fragment or any credentials, or undefined. */
function cleanUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 2000) return undefined;
    try {
        const url = new URL(raw.trim());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
        url.username = '';
        url.password = '';
        url.hash = '';
        return url.toString();
    } catch {
        return undefined;
    }
}

/**
 * Where a form was sent from: the page (sent as `_page`, or the browser's Referer, which across
 * sites is often the origin alone), where the visitor came from before (`_referrer`), and the
 * campaign in the page's `utm_*` parameters.
 */
export function submissionSource(input: {
    page?: unknown;
    referrer?: unknown;
    refererHeader?: unknown;
}): Pick<FormSubmissionMeta, 'page' | 'referrer' | 'campaign'> {
    const page = cleanUrl(input.page) ?? cleanUrl(input.refererHeader);
    const referrer = cleanUrl(input.referrer);
    const campaign: NonNullable<FormSubmissionMeta['campaign']> = {};
    if (page) {
        const params = new URL(page).searchParams;
        for (const key of CAMPAIGN_KEYS) {
            const value = params.get(`utm_${key}`)?.trim();
            if (value) campaign[key] = value.slice(0, 200);
        }
    }
    return {
        ...(page && { page }),
        ...(referrer && referrer !== page && { referrer }),
        ...(Object.keys(campaign).length > 0 && { campaign })
    };
}

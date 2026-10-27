import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isLikelyLocaleStringMap } from '../../fieldValueUtils.js';

function urlPresenceIssues(url: unknown, path: string): ValidationIssue[] {
    if (typeof url === 'string') {
        if (url.trim() === '') {
            return [
                {
                    type: 'error',
                    code: 'LINK_MISSING_URL',
                    message: 'Link URL cannot be empty.',
                    path,
                    context: { url }
                }
            ];
        }
        return [];
    }
    if (isLikelyLocaleStringMap(url)) {
        if (Object.keys(url).length === 0) {
            return [
                {
                    type: 'error',
                    code: 'LINK_MISSING_URL',
                    message: 'Link URL locale map is empty.',
                    path,
                    context: { url }
                }
            ];
        }
        const anySet = Object.values(url).some(s => typeof s === 'string' && s.trim() !== '');
        if (!anySet) {
            return [
                {
                    type: 'error',
                    code: 'LINK_MISSING_URL',
                    message: 'Link must have at least one non-empty URL in the locale map.',
                    path,
                    context: { url }
                }
            ];
        }
        return [];
    }
    return [
        {
            type: 'error',
            code: 'LINK_MISSING_URL',
            message: 'Link must have a "url" string or locale map of strings.',
            path,
            context: { url }
        }
    ];
}

/** A link to a page names it by id; its address is the page's, so a typed URL beside it is ignored. */
function pageIssues(value: Record<string, unknown>, path: string): ValidationIssue[] {
    if (typeof value.pageId !== 'string' || value.pageId.trim() === '') {
        return [
            {
                type: 'error',
                code: 'LINK_INVALID_PAGE',
                message: 'Link "pageId" must be the id of a page.',
                path: `${path}.pageId`,
                context: { pageId: value.pageId }
            }
        ];
    }
    if (value.url !== undefined && value.url !== '') {
        return [
            {
                type: 'warning',
                code: 'LINK_URL_AND_PAGE',
                message: 'Link points at a page, so its "url" is replaced by the page\'s address.',
                path: `${path}.url`,
                context: { url: value.url }
            }
        ];
    }
    return [];
}

export function validateLinkField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (typeof value === 'string') {
        if (value.trim() === '') {
            issues.push({
                type: 'error',
                code: 'LINK_EMPTY',
                message: 'Link URL cannot be empty.',
                path,
                context: { value }
            });
        }
        return issues;
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        issues.push({
            type: 'error',
            code: 'LINK_INVALID_TYPE',
            message: 'Link must be a string URL or an object with a "url" or "pageId" property.',
            path,
            context: { value }
        });
        return issues;
    }

    if ('pageId' in value) {
        issues.push(...pageIssues(value, path));
    } else {
        issues.push(...urlPresenceIssues(value.url, `${path}.url`));
    }

    if (
        value.label !== undefined &&
        typeof value.label !== 'string' &&
        !isLikelyLocaleStringMap(value.label)
    ) {
        issues.push({
            type: 'warning',
            code: 'LINK_INVALID_LABEL',
            message: 'Link "label" should be a string or locale map of strings.',
            path: `${path}.label`,
            context: { label: value.label }
        });
    }

    return issues;
}

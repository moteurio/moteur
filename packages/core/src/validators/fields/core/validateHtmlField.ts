import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { Field } from '@moteurio/types/Field.js';
// @ts-expect-error - Sanitize HTML does not have a default export
import sanitizeHtml from 'sanitize-html';

const KNOWN_HTML_TAGS = new Set([
    'p',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'a',
    'br',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'code',
    'hr',
    'sub',
    'sup',
    'mark',
    'small',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'caption',
    'img',
    'figure',
    'figcaption',
    'picture',
    'source',
    'video',
    'audio',
    'details',
    'summary',
    'abbr',
    'cite',
    'del',
    'ins',
    'time',
    'dl',
    'dt',
    'dd',
    'section',
    'article',
    'aside',
    'nav',
    'header',
    'footer',
    'iframe',
    'embed',
    'object',
    'param'
]);

function validateHtmlString(value: string, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allowedTags = field.options?.allowedTags ?? ['p', 'strong', 'em', 'ul', 'li', 'a'];
    const allowedAttributes = field.options?.allowedAttributes ?? { a: ['href', 'target'] };

    const sanitized = sanitizeHtml(value, { allowedTags, allowedAttributes });

    if (sanitized !== value) {
        issues.push({
            type: 'warning',
            code: 'HTML_SANITIZED',
            message: 'HTML was sanitized (some tags or attributes were removed).',
            path,
            context: { original: value, sanitized }
        });
    }

    const invalidTags = (allowedTags as string[]).filter(tag => !KNOWN_HTML_TAGS.has(tag));
    if (invalidTags.length > 0) {
        issues.push({
            type: 'warning',
            code: 'HTML_UNKNOWN_TAGS',
            message: `Field allows unknown HTML tags: ${invalidTags.join(', ')}`,
            path: `${path} (field.options.allowedTags)`,
            context: { invalidTags }
        });
    }

    return issues;
}

export function validateHtmlField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (typeof value !== 'string') {
        issues.push({
            type: 'error',
            code: 'HTML_INVALID_TYPE',
            message: 'Value must be a string (HTML).',
            path,
            context: { value }
        });
        return issues;
    }

    return [...issues, ...validateHtmlString(value, field, path)];
}

/**
 * Validates core/html stored value: either a string (legacy) or { html: Record<locale, string> }.
 */
export function validateHtmlStoredField(value: any, field: Field, path: string): ValidationIssue[] {
    if (typeof value === 'string') {
        return validateHtmlField(value, field, path);
    }
    if (value && typeof value === 'object' && value.html && typeof value.html === 'object') {
        const issues: ValidationIssue[] = [];
        for (const [locale, str] of Object.entries(value.html)) {
            if (typeof str !== 'string') {
                issues.push({
                    type: 'error',
                    code: 'HTML_INVALID_TYPE',
                    message: 'Value must be a string (HTML).',
                    path: `${path}.html.${locale}`,
                    context: { value: str }
                });
            } else {
                issues.push(...validateHtmlString(str, field, `${path}.html.${locale}`));
            }
        }
        return issues;
    }
    return [
        {
            type: 'error',
            code: 'HTML_INVALID_TYPE',
            message: 'Value must be a string (HTML) or { html: Record<locale, string> }.',
            path,
            context: { value }
        }
    ];
}

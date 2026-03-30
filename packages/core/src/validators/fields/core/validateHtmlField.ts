import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import type { Field, FieldValidationContext } from '@moteurio/types/Field.js';
// @ts-expect-error - Sanitize HTML does not have a default export
import sanitizeHtml from 'sanitize-html';

/** Baseline tags for HTML_UNKNOWN_TAGS; iframe/embed/object/param are project-gated. */
const BASE_KNOWN_HTML_TAGS = new Set([
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
    'footer'
]);

const IFRAME_RE = /<iframe\b/i;
const EMBED_FAMILY_RE = /<(embed|object|param)\b/i;

function knownHtmlTagsForContext(context?: FieldValidationContext): Set<string> {
    const s = new Set(BASE_KNOWN_HTML_TAGS);
    if (context?.allowHtmlIframe === true) {
        s.add('iframe');
    }
    if (context?.allowHtmlEmbed === true) {
        s.add('embed');
        s.add('object');
        s.add('param');
    }
    return s;
}

function declaredAllowedTags(field: Field): string[] {
    return (field.options?.allowedTags ?? ['p', 'strong', 'em', 'ul', 'li', 'a']) as string[];
}

function effectiveAllowedTags(field: Field, context?: FieldValidationContext): string[] {
    const allowIframe = context?.allowHtmlIframe === true;
    const allowEmbed = context?.allowHtmlEmbed === true;
    return declaredAllowedTags(field).filter(tag => {
        if (tag === 'iframe') {
            return allowIframe;
        }
        if (tag === 'embed' || tag === 'object' || tag === 'param') {
            return allowEmbed;
        }
        return true;
    });
}

function validateHtmlString(
    value: string,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allowIframe = context?.allowHtmlIframe === true;
    const allowEmbed = context?.allowHtmlEmbed === true;

    if (!allowIframe && IFRAME_RE.test(value)) {
        issues.push({
            type: 'error',
            code: 'HTML_IFRAME_NOT_ALLOWED',
            message:
                'This project does not allow iframe tags in HTML fields. Enable allowHtmlIframe in project settings.',
            path,
            context: { value }
        });
    }

    if (!allowEmbed && EMBED_FAMILY_RE.test(value)) {
        issues.push({
            type: 'error',
            code: 'HTML_EMBED_NOT_ALLOWED',
            message:
                'This project does not allow embed, object, or param tags in HTML fields. Enable allowHtmlEmbed in project settings.',
            path,
            context: { value }
        });
    }

    const allowedTags = effectiveAllowedTags(field, context);
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

    const known = knownHtmlTagsForContext(context);
    const invalidTags = declaredAllowedTags(field).filter(tag => !known.has(tag));
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

export function validateHtmlField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
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

    return [...issues, ...validateHtmlString(value, field, path, context)];
}

/**
 * Validates core/html stored value: either a string (legacy) or { html: Record<locale, string> }.
 */
export function validateHtmlStoredField(
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
): ValidationIssue[] {
    if (typeof value === 'string') {
        return validateHtmlField(value, field, path, context);
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
                issues.push(...validateHtmlString(str, field, `${path}.html.${locale}`, context));
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

import type { TemplateSchema } from '@moteurio/types/Template.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { validateFieldsAgainstSchema } from './validateFieldsAgainstSchema.js';
import { validateLayoutFieldValues } from './validateLayoutFieldValues.js';
import type { Field } from '@moteurio/types/Field.js';

export async function validatePage(
    projectId: string,
    page: { id: string; fields?: Record<string, unknown> },
    schema: TemplateSchema,
    options?: {
        projectLocales?: string[];
        allowHtmlIframe?: boolean;
        allowHtmlEmbed?: boolean;
    }
): Promise<ValidationResult> {
    const pathPrefix = `pages/${page.id}.fields`;
    const fieldOpts = {
        projectId,
        allowHtmlIframe: options?.allowHtmlIframe === true,
        allowHtmlEmbed: options?.allowHtmlEmbed === true
    };
    const issues = validateFieldsAgainstSchema(
        page.fields,
        schema.fields as Record<string, Field>,
        pathPrefix,
        'PAGE_MISSING_REQUIRED_FIELD',
        fieldOpts
    );

    const layoutFieldIssues = await validateLayoutFieldValues(
        projectId,
        page.fields,
        schema.fields as Record<string, Field>,
        pathPrefix,
        {
            projectLocales: options?.projectLocales,
            allowHtmlIframe: options?.allowHtmlIframe === true,
            allowHtmlEmbed: options?.allowHtmlEmbed === true
        }
    );
    issues.push(...layoutFieldIssues);

    const valid = issues.every(issue => issue.type !== 'error');
    return { valid, issues };
}

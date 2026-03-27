import type { TemplateSchema } from '@moteurio/types/Template.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { validateFieldsAgainstSchema } from './validateFieldsAgainstSchema.js';
import { validateLayoutFieldValues } from './validateLayoutFieldValues.js';
import type { Field } from '@moteurio/types/Field.js';

export async function validatePage(
    projectId: string,
    page: { id: string; fields?: Record<string, unknown> },
    schema: TemplateSchema,
    options?: { projectLocales?: string[] }
): Promise<ValidationResult> {
    const pathPrefix = `pages/${page.id}.fields`;
    const issues = validateFieldsAgainstSchema(
        page.fields,
        schema.fields as Record<string, Field>,
        pathPrefix,
        'PAGE_MISSING_REQUIRED_FIELD',
        { projectId }
    );

    const layoutFieldIssues = await validateLayoutFieldValues(
        projectId,
        page.fields,
        schema.fields as Record<string, Field>,
        pathPrefix,
        options?.projectLocales
    );
    issues.push(...layoutFieldIssues);

    const valid = issues.every(issue => issue.type !== 'error');
    return { valid, issues };
}

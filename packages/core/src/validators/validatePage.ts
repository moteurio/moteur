import type { TemplateSchema } from '@moteurio/types/Template.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { validateFieldsAgainstSchema } from './validateFieldsAgainstSchema.js';
import { validateLayoutFieldValues } from './validateLayoutFieldValues.js';
import { listStructures } from '../structures.js';
import type { Field } from '@moteurio/types/Field.js';

export async function validatePage(
    projectId: string,
    page: { id: string; fields?: Record<string, unknown> },
    schema: TemplateSchema,
    options?: {
        projectLocales?: string[];
        allowHtmlIframe?: boolean;
        allowHtmlEmbed?: boolean;
        /** A draft may leave required fields empty (warnings); a live page may not. */
        draft?: boolean;
    }
): Promise<ValidationResult> {
    const pathPrefix = `pages/${page.id}.fields`;
    // Read once: structure fields at any depth look their schema up here.
    const structures = await listStructures(projectId);
    const fieldOpts = {
        projectId,
        structures,
        allowHtmlIframe: options?.allowHtmlIframe === true,
        allowHtmlEmbed: options?.allowHtmlEmbed === true,
        requiredAsWarning: options?.draft === true
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
            allowHtmlEmbed: options?.allowHtmlEmbed === true,
            structures
        }
    );
    issues.push(...layoutFieldIssues);

    const valid = issues.every(issue => issue.type !== 'error');
    return { valid, issues };
}

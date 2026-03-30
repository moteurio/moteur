import { Entry } from '@moteurio/types/Model.js';
import { ModelSchema } from '@moteurio/types/Model.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { validateFieldsAgainstSchema } from './validateFieldsAgainstSchema.js';
import { validateLayoutFieldValues } from './validateLayoutFieldValues.js';

export async function validateEntry(
    projectId: string,
    entry: Entry,
    schema: ModelSchema,
    options?: {
        projectLocales?: string[];
        allowHtmlIframe?: boolean;
        allowHtmlEmbed?: boolean;
    }
): Promise<ValidationResult> {
    const pathPrefix = `models/${schema.id}/entries/${entry.id}.data`;
    const fieldOpts = {
        projectId,
        allowHtmlIframe: options?.allowHtmlIframe === true,
        allowHtmlEmbed: options?.allowHtmlEmbed === true
    };
    const issues = validateFieldsAgainstSchema(
        entry.data,
        schema.fields,
        pathPrefix,
        'ENTRY_MISSING_REQUIRED_FIELD',
        fieldOpts
    );

    const layoutFieldIssues = await validateLayoutFieldValues(
        projectId,
        entry.data,
        schema.fields,
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

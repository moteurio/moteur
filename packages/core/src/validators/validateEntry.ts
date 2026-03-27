import { Entry } from '@moteurio/types/Model.js';
import { ModelSchema } from '@moteurio/types/Model.js';
import { ValidationResult } from '@moteurio/types/ValidationResult.js';
import { validateFieldsAgainstSchema } from './validateFieldsAgainstSchema.js';
import { validateLayoutFieldValues } from './validateLayoutFieldValues.js';

export async function validateEntry(
    projectId: string,
    entry: Entry,
    schema: ModelSchema,
    options?: { projectLocales?: string[] }
): Promise<ValidationResult> {
    const pathPrefix = `models/${schema.id}/entries/${entry.id}.data`;
    const issues = validateFieldsAgainstSchema(
        entry.data,
        schema.fields,
        pathPrefix,
        'ENTRY_MISSING_REQUIRED_FIELD',
        { projectId }
    );

    const layoutFieldIssues = await validateLayoutFieldValues(
        projectId,
        entry.data,
        schema.fields,
        pathPrefix,
        options?.projectLocales
    );
    issues.push(...layoutFieldIssues);

    const valid = issues.every(issue => issue.type !== 'error');
    return { valid, issues };
}

import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import { isFieldRequired, isMissingValue } from './validateFieldsAgainstSchema.js';

/** Top-level required fields an entry leaves empty. */
export function missingRequiredFields(entry: Entry, schema: ModelSchema): string[] {
    return Object.entries(schema.fields ?? {})
        .filter(([key, field]) => isFieldRequired(field) && isMissingValue(entry.data?.[key]))
        .map(([key]) => key);
}

/** Thrown when an incomplete draft is sent to review or published. HTTP 400. */
export class IncompleteEntryError extends Error {
    readonly statusCode = 400;
    readonly code = 'ENTRY_INCOMPLETE';
    constructor(
        readonly entryId: string,
        readonly missing: string[],
        action: 'publish' | 'review'
    ) {
        super(
            `${action === 'publish' ? 'Publishing' : 'Asking for review'} needs every required field: ` +
                `"${entryId}" has no ${missing.join(', ')}.`
        );
        this.name = 'IncompleteEntryError';
    }
}

/**
 * Drafts may be saved with required fields still empty; an entry going to review or live may not.
 */
export function assertEntryComplete(
    entry: Entry,
    schema: ModelSchema,
    action: 'publish' | 'review'
): void {
    const missing = missingRequiredFields(entry, schema);
    if (missing.length > 0) throw new IncompleteEntryError(entry.id, missing, action);
}

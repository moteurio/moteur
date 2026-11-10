import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import { validateFieldsAgainstSchema } from './validateFieldsAgainstSchema.js';

/** The issue codes that report a missing required value, one for each depth (top level, blocks, groups and so on). */
const MISSING = new Set([
    'ENTRY_MISSING_REQUIRED_FIELD',
    'BLOCK_REQUIRED_FIELD',
    'LAYOUT_REQUIRED_FIELD',
    'STRUCTURE_REQUIRED_FIELD',
    'OBJECT_MISSING_REQUIRED_FIELD',
    'VARIANT_MISSING_REQUIRED_FIELD'
]);

/**
 * Finds the required values an entry leaves empty, at any depth: in a top-level field or inside
 * its blocks, groups, structures and variants. `where` lists the path of each empty value (for
 * example `author` or `body[2].image`). `fields` lists the top-level field that contains each one,
 * once, in schema order, which clients use for labels. `projectId` is needed to find the project's
 * own blocks.
 */
export function missingRequired(
    entry: Entry,
    schema: ModelSchema,
    projectId?: string
): { fields: string[]; where: string[] } {
    const issues = validateFieldsAgainstSchema(
        entry.data ?? {},
        schema.fields ?? {},
        'data',
        'ENTRY_MISSING_REQUIRED_FIELD',
        { projectId, requiredAsWarning: true }
    ).filter(issue => MISSING.has(issue.code));
    const where = issues.map(issue =>
        (issue.path ?? '').replace(/^data\./, '').replace(/\.data\./g, '.')
    );
    const tops = new Set(where.map(w => w.split(/[.[]/)[0]));
    return { fields: Object.keys(schema.fields ?? {}).filter(k => tops.has(k)), where };
}

/** Returns the top-level fields that contain a required value left empty at any depth (see missingRequired). */
export function missingRequiredFields(
    entry: Entry,
    schema: ModelSchema,
    projectId?: string
): string[] {
    return missingRequired(entry, schema, projectId).fields;
}

/** Thrown when an incomplete draft is sent to review or published. HTTP 400. */
export class IncompleteEntryError extends Error {
    readonly statusCode = 400;
    readonly code = 'ENTRY_INCOMPLETE';
    constructor(
        readonly entryId: string,
        readonly missing: string[],
        action: 'publish' | 'review',
        /** The path of each empty required value (for example `body[2].image`), used in the message. */
        where: string[] = missing
    ) {
        super(
            `${action === 'publish' ? 'Publishing' : 'Asking for review'} needs every required field: ` +
                `"${entryId}" has no ${where.join(', ')}.`
        );
        this.name = 'IncompleteEntryError';
    }
}

/**
 * Throws if the entry has empty required values at any depth. Drafts may be saved with empty
 * required values, but an entry that goes to review or live may not.
 */
export function assertEntryComplete(
    entry: Entry,
    schema: ModelSchema,
    action: 'publish' | 'review',
    projectId?: string
): void {
    const { fields, where } = missingRequired(entry, schema, projectId);
    if (fields.length > 0) throw new IncompleteEntryError(entry.id, fields, action, where);
}

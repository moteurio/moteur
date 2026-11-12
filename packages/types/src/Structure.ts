import type { Localizable } from './PublicSchema.js';
import { Field } from './Field.js';

export interface StructureSchema {
    type: string; // Unique structure ID (for example "core/teamMember")
    /** Display name: a single string, or a map from locale code to string such as `{ en, fr }`. */
    label: Localizable;
    description?: string; // Description of the structure
    fields: Record<string, Field>; // Field definitions, keyed by field ID
    options?: Record<string, any>; // Additional options
}

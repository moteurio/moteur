import type { Localizable } from './PublicSchema.js';
import { Field } from './Field.js';

export interface StructureSchema {
    type: string; // Unique structure ID (e.g., "core/teamMember")
    /** Its name: one, or one per language (`{ en, fr }`). */
    label: Localizable;
    description?: string; // Optional description
    fields: Record<string, Field>; // Field definitions for the structure
    options?: Record<string, any>; // Optional additional options for the structure
}

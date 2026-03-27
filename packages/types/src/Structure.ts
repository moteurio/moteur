import { Field } from './Field.js';

export interface StructureSchema {
    type: string; // Unique structure ID (e.g., "core/teamMember")
    label: string; // Human-readable label
    description?: string; // Optional description
    fields: Record<string, Field>; // Field definitions for the structure
    options?: Record<string, any>; // Optional additional options for the structure
}

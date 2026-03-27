import { Field } from './Field.js';

export interface Block {
    type: string; // Block type (e.g., "core/hero")
    data: Record<string, any>; // Block content data
    variant?: string; // Free-text presentation hint (e.g. "dark", "compact", "large")
    locales?: string[]; // Restrict block to specific locales; absent or empty = all locales
    conditions?: Record<string, any>; // Visibility rules for the block
    meta?: BlockMeta; // Metadata for styling and attributes
    options?: Record<string, any>; // Additional options
}

export interface BlockSchema {
    type: string; // Schema type
    label: string; // Display label
    description?: string; // Optional description
    category?: string; // Category for grouping
    fields: Record<string, Field>; // Field definitions for the block
    optionsSchema?: Record<string, any>; // Additional options
    variantHints?: string[]; // Suggested variant values (documentation only — not enforced)
    editorial?: boolean; // If true, block is stripped from public API responses (Studio-only)
}

export interface BlockMeta {
    customClass?: string; // Custom CSS classes
    customStyle?: string | Record<string, string>; // Inline styles
    attributes?: Record<string, string>; // Extra HTML attributes
    id?: string; // Manual block ID (e.g., for anchors)
    hidden?: boolean; // Skip rendering if true
    previewHint?: string; // Optional label shown in the editor
}

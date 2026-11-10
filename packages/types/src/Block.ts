import type { Localizable } from './PublicSchema.js';
import { Field } from './Field.js';

export interface Block {
    type: string; // Block type (for example "core/hero")
    data: Record<string, any>; // Block content
    variant?: string; // Free-text presentation hint (for example "dark", "compact" or "large")
    locales?: string[]; // Locales the block applies to. When absent or empty, it applies to all locales
    conditions?: Record<string, any>; // Rules that decide when the block is visible
    meta?: BlockMeta; // Styling and HTML attribute metadata
    options?: Record<string, any>; // Additional options
}

export interface BlockSchema {
    type: string; // Block type this schema defines
    /** Display name: a single string, or a map from locale code to string such as `{ en, fr }`. */
    label: Localizable;
    /** Explains what the block is for, shown in editing UIs: a single string, or a map from locale code to string. */
    description?: Localizable;
    category?: string; // Category used to group blocks
    fields: Record<string, Field>; // Field definitions, keyed by field ID
    optionsSchema?: Record<string, any>; // Additional options
    variantHints?: string[]; // Suggested variant values. Documentation only; they are not enforced
    editorial?: boolean; // When true, the block is removed from public API responses and is used only in admin clients
}

export interface BlockMeta {
    customClass?: string; // Additional CSS classes
    customStyle?: string | Record<string, string>; // Inline styles
    attributes?: Record<string, string>; // Additional HTML attributes
    id?: string; // Manually set element ID, for example as an anchor target
    hidden?: boolean; // When true, the block is not rendered
    previewHint?: string; // Label shown in editing UIs
}

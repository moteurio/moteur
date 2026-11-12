import type { Localizable } from './PublicSchema.js';
import { ValidationIssue } from './ValidationResult.js';
import type { StructureSchema } from './Structure.js';

/** Optional context passed to field validators, such as project-scoped block schemas. */
export interface FieldValidationContext {
    projectId?: string;
    /** Value of `project.allowHtmlIframe`. core/html validation accepts iframe tags only when this is true. */
    allowHtmlIframe?: boolean;
    /** Value of `project.allowHtmlEmbed`. core/html validation accepts embed, object and param tags only when this is true. */
    allowHtmlEmbed?: boolean;
    /**
     * The project's structures, loaded before validation because validators are synchronous.
     * Without it, core/structure fields can resolve only the built-in structures.
     */
    structures?: Record<string, StructureSchema>;
    /**
     * When true (validating a draft), an empty required value at any depth (blocks, structures,
     * objects, variants) is reported as a warning instead of an error. Review and publishing
     * enforce required values with `assertEntryComplete`.
     */
    requiredAsWarning?: boolean;
}

export interface Field {
    id?: string; // Unique identifier for the field
    type: string; // Field type (for example "core/text" or "core/number")
    /** Display name: a single string, or a map from locale code to string such as `{ en, fr }`. */
    label: Localizable;
    /** Help text that editing UIs show with the field: a single string, or a map from locale code to string. */
    description?: Localizable;
    data?: Record<string, Field>; // Values for the fields defined by the schema
    meta?: FieldMeta; // Styling and HTML attribute metadata
    options?: Record<string, any>; // Additional field options
    [key: string]: any; // Additional custom options
}

export type FieldValidator = (
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
) => ValidationIssue[];

export interface FieldSchema {
    id?: string; // Unique identifier for the field schema, which is the field type (for example "core/text")
    type: string; // Schema type
    label: string; // Display label
    description?: string; // Optional description
    fields?: Record<string, FieldSchema>; // Definitions of the fields in an instance's data
    options?: FieldOptions; // Additional options
    default?: any; // Default value for the field
    required?: boolean; // Whether the field is mandatory
    pattern?: string; // Regex pattern for validation
    storeDirect?: boolean; // Store the value directly as a primitive (for example a string or number)
    validate?: FieldValidator; // Validator registered with this field type
    resolveValue?: boolean; // When false, the storeDirect unwrapping is skipped because the field handles its own value
    [key: string]: any; // Additional custom options
}

export interface FieldMeta {
    id?: string; // Manually set element ID, for example as an anchor target
    customClass?: string; // Additional CSS classes
    customStyle?: string | Record<string, string>; // Inline styles
    attributes?: Record<string, string>; // Extra HTML attributes
    hidden?: boolean; // When true, the field is not rendered
    [key: string]: any; // Additional custom options
}

export interface FieldOptions {
    required?: boolean; // Whether the field is mandatory
    multilingual?: boolean; // Whether the field holds a separate value per locale
    ui?: string; // Free-text hint to editing UIs about which input to use (for example "textarea", "radio" or "slider")
    [key: string]: any; // Additional custom options
}

export const fieldSchema: FieldSchema = {
    id: 'core/field',
    type: 'core/field',
    label: 'Field',
    description: 'Base schema for defining fields in a model or form.',
    fields: {
        id: {
            id: 'id',
            type: 'core/text',
            label: 'Field ID',
            description: 'Unique identifier for the field',
            options: {
                required: true,
                pattern: '^[a-zA-Z0-9_-]+$',
                patternError:
                    'Field ID must contain only alphanumeric characters, underscores, or hyphens.'
            }
        },
        type: {
            id: 'type',
            type: 'core/text',
            label: 'Field Type',
            description: 'Type of the field (e.g., core/text, core/number, core/select)',
            options: {
                required: true
            }
        },
        label: {
            id: 'label',
            type: 'core/text',
            label: 'Field Label',
            description: 'Display label for the field',
            options: {
                required: true
            }
        },
        description: {
            id: 'description',
            type: 'core/text',
            label: 'Field Description',
            description: 'Optional description for the field',
            options: {
                required: false
            }
        },
        storeDirect: {
            id: 'storeDirect',
            type: 'core/boolean',
            label: 'Store Directly',
            description:
                'Whether to store the field value directly (as a primitive or complex type)',
            options: {
                default: false,
                required: false
            }
        }
    },
    options: {}
};

import { ValidationIssue } from './ValidationResult.js';

/** Optional context passed through field validators (e.g. project-scoped block schemas). */
export interface FieldValidationContext {
    projectId?: string;
}

export interface Field {
    id?: string; // Unique identifier for the field
    type: string; // Field type (e.g., "text", "number")
    label: string; // Display label
    description?: string; // Optional description for the field
    data?: Record<string, Field>; // Values defined by schema's fields.
    meta?: FieldMeta; // Metadata for styling and attributes
    options?: Record<string, any>; // Additional options for the field
    [key: string]: any; // Additional custom options
}

export type FieldValidator = (
    value: any,
    field: Field,
    path: string,
    context?: FieldValidationContext
) => ValidationIssue[];

export interface FieldSchema {
    id?: string; // Unique identifier for the field schema (field type, e.g., "core/text")
    type: string; // Schema type
    label: string; // Display label
    description?: string; // Optional description
    fields?: Record<string, FieldSchema>; // Field definitions for instance data
    options?: FieldOptions; // Additional options
    default?: any; // Default value for the field
    required?: boolean; // Whether the field is mandatory
    pattern?: string; // Regex pattern for validation
    storeDirect?: boolean; // Store as primitive value (e.g., string, number)
    validate?: FieldValidator; // Optional validator registered with this field type
    resolveValue?: boolean; // If false, skip storeDirect unwrapping (field handles its own)
    [key: string]: any; // Additional custom options
}

export interface FieldMeta {
    id?: string; // Manual block ID (e.g., for anchors)
    customClass?: string; // Custom CSS classes
    customStyle?: string | Record<string, string>; // Inline styles
    attributes?: Record<string, string>; // Extra HTML attributes
    hidden?: boolean; // Skip rendering if true
    [key: string]: any; // Additional custom options
}

export interface FieldOptions {
    required?: boolean; // Whether the field is mandatory
    multilingual?: boolean; // Whether the field supports multiple languages
    ui?: string; // Free-text hint for Studio input type (e.g. "textarea", "radio", "slider")
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

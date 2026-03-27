import { Audit } from './Audit.js';
import { Field } from './Field.js';

export type EntryStatus = 'draft' | 'in_review' | 'published' | 'unpublished';

export interface Entry {
    id: string;
    type: string; // The ModelSchema this instance belongs to
    data: Record<string, any>;
    status?: EntryStatus; // default: 'draft'
    meta?: {
        audit?: Audit;
    };
    options?: Record<string, any>; // Additional options (e.g., versioning)
}

export interface ModelSchema {
    id: string; // Unique identifier (e.g., 'core/post')
    label: string; // Human-readable label
    description?: string; // Optional description
    fields: Record<string, Field>; // Field definitions
    modelType?: 'content' | 'userData' | 'taxonomy' | 'settings'; // Type of model
    optionsSchema?: Record<string, any>; // Additional config (e.g., versioning)
    /** Default URL segment pattern for entries of this model. e.g. '[post.slug]', '[category.slug]/[post.slug]'. Used by CollectionPage unless overridden by urlPattern on the node. */
    urlPattern?: string;
    meta?: {
        audit?: Audit;
    };
}

export const modelSchemaFields: Record<string, Field> = {
    id: {
        type: 'core/text',
        label: 'ID',
        options: { multilingual: false, required: true }
    },
    label: {
        type: 'core/text',
        label: 'Label',
        options: { multilingual: true, required: true }
    },
    description: {
        type: 'core/text',
        label: 'Description',
        options: { multilingual: true, required: false }
    },
    modelType: {
        type: 'core/select',
        label: 'Model Type',
        options: {
            choices: [
                { value: 'content', label: 'Content' },
                { value: 'userData', label: 'User Data' },
                { value: 'taxonomy', label: 'Taxonomy' },
                { value: 'settings', label: 'Settings' }
            ],
            allowEmpty: false,
            required: true
        }
    }
};

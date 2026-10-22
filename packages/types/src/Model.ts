import { Audit } from './Audit.js';
import { Field } from './Field.js';
import type { ModelStudio } from './StudioForm.js';

export type EntryStatus = 'draft' | 'in_review' | 'published' | 'unpublished';

export interface Entry {
    id: string;
    type: string; // The ModelSchema this instance belongs to
    data: Record<string, any>;
    status?: EntryStatus; // default: 'draft'
    meta?: {
        audit?: Audit;
        /**
         * Text a helper wrote and a person kept, by field (`title`, or `title.en` for one
         * language). The engine stamps who kept it and who read it; the mark goes when the
         * Studio sends the field without it.
         */
        assisted?: Record<string, AssistedMark>;
    };
    options?: Record<string, any>; // Additional options (e.g., versioning)
}

/** Which helper wrote a field's text. `agent` is an AI client acting for someone (its name in `action`). */
export type AssistHelper = 'write' | 'translate' | 'notes' | 'alt' | 'audio' | 'model3d' | 'agent';

export interface AssistedMark {
    helper: AssistHelper;
    /** What was asked: `shorten`, `fr→en`… */
    action?: string;
    keptBy?: string;
    keptAt?: string;
    /** Someone read it (edited it, or said it looks right): it is no longer "not yet read". */
    readBy?: string;
    readAt?: string;
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
    /** How the Studio presents this model's entries (its form). Presentation only. */
    studio?: ModelStudio;
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

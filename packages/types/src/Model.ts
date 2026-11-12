import type { Localizable } from './PublicSchema.js';
import { Audit } from './Audit.js';
import { Field } from './Field.js';
import type { ModelStudio } from './StudioForm.js';

export type EntryStatus = 'draft' | 'in_review' | 'published' | 'unpublished';

export interface Entry {
    id: string;
    type: string; // ID of the ModelSchema this entry belongs to
    data: Record<string, any>;
    status?: EntryStatus; // Defaults to 'draft'
    /**
     * Locales the entry exists in. The default locale is always included. When omitted, the entry
     * exists in every locale of the project. A locale that is not listed gets no URL, sitemap entry
     * or hreflang, and links to the entry in that locale point to the default locale's URL.
     */
    languages?: string[];
    meta?: {
        audit?: Audit;
        /**
         * Marks on fields whose text an AI helper wrote and a person kept, keyed by field path
         * (`title`, or `title.en` for a single locale). The engine records who kept the text and who
         * read it. The mark is removed when a client saves the field without it.
         */
        assisted?: Record<string, AssistedMark>;
    };
    options?: Record<string, any>; // Additional options, for example versioning
}

/** The helper that wrote a field's text. `agent` is an AI client acting for a user, and its name is stored in `action`. */
export type AssistHelper = 'write' | 'translate' | 'notes' | 'alt' | 'audio' | 'model3d' | 'agent';

export interface AssistedMark {
    helper: AssistHelper;
    /** The request that produced the text, for example `shorten` or `fr→en`. */
    action?: string;
    keptBy?: string;
    keptAt?: string;
    /** The user who reviewed the text, either by editing it or by confirming it. Once set, the text is no longer flagged as unread. */
    readBy?: string;
    readAt?: string;
}

export interface ModelSchema {
    id: string; // Unique identifier (for example 'core/post')
    /** Display name: a single string, or a map from locale code to string such as `{ en, fr }`. */
    label: Localizable;
    description?: string; // Description of the model
    fields: Record<string, Field>; // Field definitions, keyed by field ID
    modelType?: 'content' | 'userData' | 'taxonomy' | 'settings'; // Kind of model
    optionsSchema?: Record<string, any>; // Additional configuration, for example versioning
    /** Default URL pattern for entries of this model, for example `[post.slug]` or `[category.slug]/[post.slug]`. A collection page uses it unless the page sets its own `urlPattern`. */
    urlPattern?: string;
    /** How admin clients present this model's entries (its form). Presentation only. */
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

import type { Localizable } from './PublicSchema.js';
import type { Field } from './Field.js';

export const templateSchemaFields: Record<string, Field> = {
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
    }
};

export interface TemplateSchema {
    id: string;
    projectId: string;
    /** Display name: a single string, or a map from locale code to string such as `{ en, fr }`. */
    label: Localizable;
    description?: string;
    fields: Record<string, Field>;
    createdAt: string;
    updatedAt: string;
}

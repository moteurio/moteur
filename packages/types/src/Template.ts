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
    label: string;
    description?: string;
    fields: Record<string, Field>;
    createdAt: string;
    updatedAt: string;
}

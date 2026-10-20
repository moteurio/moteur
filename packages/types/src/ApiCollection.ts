import type { EntryStatus } from './Model.js';

export type ApiCollectionResource = {
    resourceType: 'model' | 'page' | 'layout' | 'form' | 'menu';
    /**
     * modelId or 'models'; 'pages' or a templateId; layout id or 'layouts'; form id or 'forms';
     * menu handle or 'menus'. The plural means every one of that kind.
     */
    resourceId: string;
    fields?: string[]; // list of field names to include; null/empty = all fields
    filters?: {
        status?: EntryStatus | EntryStatus[];
        locale?: string;
    };
    resolve?: 0 | 1 | 2; // reference resolution depth; default: 0
};

// API Collections are often called "Channels" in frontends.
export interface ApiCollection {
    id: string;
    projectId: string;
    label: string;
    description?: string;
    resources: ApiCollectionResource[];
    createdAt: string;
    updatedAt: string;
}

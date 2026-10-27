import type { EntryStatus } from './Model.js';

export type ChannelResource = {
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

/** Present on `GET .../channels/:id` — relative paths (prepend API base). */
export interface ChannelPublicLinks {
    openApiJson: string;
}

export interface Channel {
    id: string;
    projectId: string;
    label: string;
    description?: string;
    resources: ChannelResource[];
    createdAt: string;
    updatedAt: string;
    /** Auto-generated public API doc URLs (read single-channel GET only). */
    publicApi?: ChannelPublicLinks;
}

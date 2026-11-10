import type { EntryStatus } from './Model.js';

export type ChannelResource = {
    resourceType: 'model' | 'page' | 'layout' | 'form' | 'menu';
    /**
     * What the channel delivers. Depending on `resourceType`: a model ID, a template ID or
     * `pages`, a layout ID, a form ID, or a menu handle. The plural keywords `models`, `pages`,
     * `layouts`, `forms` and `menus` select every resource of that kind.
     */
    resourceId: string;
    fields?: string[]; // Names of the fields to include. Null or empty includes all fields
    filters?: {
        status?: EntryStatus | EntryStatus[];
        locale?: string;
    };
    resolve?: 0 | 1 | 2; // Depth to which references are resolved. Defaults to 0
};

/** Links included in the response of `GET .../channels/:id`. The paths are relative; prepend the API base URL. */
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
    /** Generated URLs of the channel's public API documentation. Included only when reading a single channel. */
    publicApi?: ChannelPublicLinks;
}

import type { ComponentType } from 'react';
import type { Field } from '@moteurio/types/Field.js';

/** Props for a custom field editor in Studio. They follow the editor's field grid contract. */
export type StudioFieldEditorProps<T = unknown> = {
    labelledBy: string;
    field: Field;
    value: T | undefined;
    onChange: (value: T | undefined) => void;
    locale?: string;
    invalid?: boolean;
    path?: string;
    presentation?: string;
};

export type StudioBlockPreviewProps = {
    blockType: string;
    data: Record<string, unknown>;
    locale?: string;
};

export type StudioProjectRoute = {
    /** The path segment under `/projects/:projectId/`, without a leading slash. */
    path: string;
    label: string;
    /** When set, the member needs one of these roles in the project to see the route. */
    roles?: string[];
    element: ComponentType;
};

export type StudioOperatorRoute = {
    path: string;
    label: string;
    element: ComponentType;
};

export type StudioFieldEditorComponent = ComponentType<StudioFieldEditorProps<any>>;
export type StudioBlockPreviewComponent = ComponentType<StudioBlockPreviewProps>;

export type StudioHostAdapter = {
    registerFieldEditor: (fieldType: string, component: StudioFieldEditorComponent) => void;
    registerBlockPreview: (
        blockType: string,
        component: StudioBlockPreviewComponent,
        pluginId?: string
    ) => void;
    registerProjectRoute: (route: StudioProjectRoute) => void;
    registerOperatorRoute: (route: StudioOperatorRoute) => void;
};

export type StudioScopeValue = {
    projectId?: string;
};

export type StudioHostConfig = {
    /** The public API origin without a trailing slash, used to build plugin asset URLs. */
    publicApiUrl: string;
    /**
     * Fetches a path under `/projects/:projectId/…` with authentication. The Studio host supplies
     * the bearer token. Block previews use it to call project-scoped plugin routes.
     */
    fetchProject?: (projectId: string, pathWithQuery: string) => Promise<Response>;
    resolveAssetUrl?: (projectId: string, assetId: string) => Promise<string | undefined>;
};

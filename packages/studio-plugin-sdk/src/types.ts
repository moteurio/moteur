import type { ComponentType } from 'react';
import type { Field } from '@moteurio/types/Field.js';

/** Props for a custom field editor in Studio (matches the editor field grid contract). */
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
    /** Path segment under `/projects/:projectId/` (no leading slash). */
    path: string;
    label: string;
    /** When set, member must have one of these roles in the project. */
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
    /** Public API origin (no trailing slash), for plugin asset URLs. */
    publicApiUrl: string;
    /**
     * Authenticated fetch under `/projects/:projectId/…` (Studio host provides bearer token).
     * Used by block previews that call project-scoped plugin routes.
     */
    fetchProject?: (projectId: string, pathWithQuery: string) => Promise<Response>;
    resolveAssetUrl?: (projectId: string, assetId: string) => Promise<string | undefined>;
};

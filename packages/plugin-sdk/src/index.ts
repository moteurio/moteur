import type {
    AuthProviderContribution,
    PluginManifest,
    PluginRouteContext,
    PluginRouteContribution
} from '@moteurio/types/Plugin.js';
import type { VideoProvidersConfig } from '@moteurio/types/Project.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { BlueprintSchema } from '@moteurio/types/Blueprint.js';
import type { FieldSchema } from '@moteurio/types/Field.js';

export type HostPluginScope = 'global' | 'project';

export interface HostPluginManifest extends PluginManifest {
    scope?: HostPluginScope;
}

export type PluginInitContext = {
    onEvent: (...args: any[]) => any;
    isPluginEnabledForProject: (projectId: string, pluginId: string) => Promise<boolean>;
    registerStorageAdapterFactory: (id: string, factory: (config: unknown) => unknown) => void;
    registerVideoProviderFactory: (id: string, factory: (config: unknown) => unknown) => void;
    setVideoProvidersConfig: (config: VideoProvidersConfig | null) => void;
    registerBlockSchema: (schema: BlockSchema) => void;
    registerBlueprint: (blueprint: BlueprintSchema) => void;
    registerFieldSchema: (field: FieldSchema) => void;
};

export type HostPluginModule = {
    manifest: HostPluginManifest;
    init(ctx: PluginInitContext): void | Promise<void>;
    getRoutes?(ctx: PluginRouteContext): PluginRouteContribution | PluginRouteContribution[];
    getAuthProviders?(): AuthProviderContribution[];
    attachServer?(server: import('http').Server, app: unknown): void;
};

export type HostPluginRegistration = {
    id: string;
    loader: () => Promise<{ default: HostPluginModule }>;
    enabled?: boolean;
};

export type HostPluginRuntimeConfig = {
    plugins: HostPluginRegistration[];
};

export type PluginOpenApiPaths = Record<string, unknown>;

export function definePlugin(plugin: HostPluginModule): HostPluginModule {
    return plugin;
}

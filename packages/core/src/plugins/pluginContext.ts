/**
 * Context passed to plugin init(). Provides hooks into the core event bus,
 * per-project enablement, storage adapters, and video providers.
 * Keep plugins self-contained: depend only on this context and minimal core APIs
 * so they can be moved to a separate repo later.
 */
import { onEvent } from '../utils/eventBus.js';
import { getProjectById } from '../projects.js';
import { registerAdapterFactory } from '../assets/adapterRegistry.js';
import { registerProviderFactory, setVideoProvidersConfig } from '../assets/providerRegistry.js';
import { registerBlockSchema as registerBlockSchemaCore } from '../blocks.js';
import { registerBlueprint as registerBlueprintCore } from '../blueprints.js';
import fieldRegistry from '../registry/FieldRegistry.js';
import type { PluginInitContext } from '@moteurio/plugin-sdk';
import type { FieldSchema } from '@moteurio/types/Field.js';

const globalScopePluginIds = new Set<string>();

export function setPluginScope(pluginId: string, scope: 'global' | 'project' = 'project'): void {
    if (scope === 'global') globalScopePluginIds.add(pluginId);
    else globalScopePluginIds.delete(pluginId);
}

/**
 * Check whether a plugin is enabled for a given project.
 * Plugins are active when registered on the server (MOTEUR_OPTIONAL_PLUGINS); they can then be enabled/disabled per-project (e.g. by project.plugins or tier).
 * When project.plugins is undefined, all server-enabled plugins are considered enabled for that project.
 * When project.plugins is set, only listed plugin IDs are enabled for that project.
 */
async function isPluginEnabledForProject(projectId: string, pluginId: string): Promise<boolean> {
    if (globalScopePluginIds.has(pluginId)) return true;
    const project = await getProjectById(projectId);
    if (!project) return false;
    const list = project.plugins;
    if (list === undefined || list === null) return true; // no list = all plugins enabled for project
    return Array.isArray(list) && list.includes(pluginId);
}

/** Core implementation uses typed `onEvent` from the event bus; plugin-sdk keeps factories loosely typed for third-party plugins. */
export type PluginContext = Omit<PluginInitContext, 'onEvent'> & {
    onEvent: typeof onEvent;
};

export function createPluginContext(): PluginContext {
    return {
        onEvent,
        isPluginEnabledForProject,
        registerStorageAdapterFactory:
            registerAdapterFactory as PluginInitContext['registerStorageAdapterFactory'],
        registerVideoProviderFactory:
            registerProviderFactory as PluginInitContext['registerVideoProviderFactory'],
        setVideoProvidersConfig,
        registerBlockSchema: registerBlockSchemaCore,
        registerBlueprint: registerBlueprintCore,
        registerFieldSchema: (field: FieldSchema) => {
            fieldRegistry.register(field);
        }
    };
}

// src/core/PluginManager.ts

import { PluginModule } from '@moteurio/types/Plugin.js';
import { pluginRegistry } from '../registry/PluginRegistry.js';
import { loadPluginsForProject } from '../utils/loadPlugins.js';

export class PluginManager {
    private projectId: string;
    private pluginIds: string[];
    private pluginModules: PluginModule[] = [];
    private loaded = false;

    constructor(projectId: string, pluginIds: string[]) {
        this.projectId = projectId;
        this.pluginIds = pluginIds;
    }

    /**
     * Loads all plugins for this project if not already loaded.
     */
    async load(): Promise<void> {
        if (this.loaded) return;
        this.pluginModules = await loadPluginsForProject(this.pluginIds);
        this.loaded = true;
    }

    /**
     * Returns all loaded plugin modules.
     */
    getAll(): PluginModule[] {
        return this.pluginModules;
    }

    /**
     * Returns only route handlers for plugins that expose them.
     */
    getRoutes(): PluginModule['routes'][] {
        return this.pluginModules.filter(p => !!p.routes).map(p => p.routes!);
    }

    /**
     * Returns developer API hooks.
     */
    getApis(): PluginModule['api'][] {
        return this.pluginModules.filter(p => !!p.api).map(p => p.api!);
    }

    /**
     * Returns plugin manifests (available and enabled).
     */
    getManifests(): ReturnType<typeof pluginRegistry.all> {
        return pluginRegistry.all();
    }

    /**
     * Clears internal cache (useful for dev reloads or tests).
     */
    reset(): void {
        this.pluginModules = [];
        this.loaded = false;
    }
}

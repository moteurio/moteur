// src/registry/PluginRegistry.ts

import type { PluginManifest } from '@moteurio/types/Plugin.js';

export class PluginRegistry {
    private plugins: Record<string, PluginManifest> = {};

    register(id: string, manifest: PluginManifest): void {
        this.plugins[id] = manifest;
    }

    get(id: string): PluginManifest {
        const plugin = this.plugins[id];
        if (!plugin) {
            throw new Error(`Plugin "${id}" not found in registry.`);
        }
        return plugin;
    }

    has(id: string): boolean {
        return !!this.plugins[id];
    }

    list(): string[] {
        return Object.keys(this.plugins);
    }

    all(): Record<string, PluginManifest> {
        return this.plugins;
    }

    clear(): void {
        this.plugins = {};
    }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();

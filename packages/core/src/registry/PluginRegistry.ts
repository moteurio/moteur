// src/registry/PluginRegistry.ts

import type { PluginContributions, PluginManifest } from '@moteurio/types/Plugin.js';
import { mergeContributions } from '@moteurio/types/Plugin.js';

export class PluginRegistry {
    private plugins: Record<string, PluginManifest> = {};
    private contributions: Record<string, PluginContributions> = {};

    register(id: string, manifest: PluginManifest): void {
        this.plugins[id] = manifest;
        if (manifest.contributes) {
            this.contributions[id] = mergeContributions(
                this.contributions[id],
                manifest.contributes
            );
        }
    }

    setContributions(id: string, contributions: PluginContributions): void {
        this.contributions[id] = mergeContributions(this.contributions[id], contributions);
    }

    getContributions(id: string): PluginContributions {
        return this.contributions[id] ?? {};
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
        this.contributions = {};
    }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();

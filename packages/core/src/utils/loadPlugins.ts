import path from 'path';
import { pathToFileURL } from 'url';
import { PluginManifest, PluginModule } from '@moteurio/types/Plugin.js';
import { pluginRegistry } from '../registry/PluginRegistry.js';

export async function loadPluginsForProject(pluginIds: string[]): Promise<PluginModule[]> {
    const loaded: PluginModule[] = [];

    for (const id of pluginIds) {
        if (!pluginRegistry.has(id)) {
            throw new Error(`Plugin "${id}" is not available or not registered.`);
        }

        const manifest = pluginRegistry.get(id);
        const plugin = await loadPluginById(manifest);
        loaded.push(plugin);
    }

    return loaded;
}

export async function loadPluginById(
    manifest: PluginManifest,
    overridePath?: string
): Promise<PluginModule> {
    const plugin: PluginModule = {
        name: manifest.id,
        dataPath: '',
        manifest
    };

    // Built-in core plugins are already initialized at server start; return manifest-only module
    if (manifest.source === 'builtin') {
        return plugin;
    }

    try {
        if (manifest.source === 'local') {
            const base = overridePath
                ? path.resolve(overridePath)
                : path.resolve(`./plugins/${manifest.id}`);

            const tryImport = async (key: keyof PluginModule, file: string) => {
                try {
                    const mod = await import(pathToFileURL(path.join(base, file)).href);
                    plugin[key] = mod?.default ?? mod;
                } catch (error) {
                    console.error(`[plugin:${manifest.id}] Failed to load ${file}`, error);
                }
            };

            await Promise.all([
                tryImport('api', 'api.ts'),
                tryImport('routes', 'routes.ts'),
                tryImport('storage', 'storage.ts'),
                tryImport('tests', 'api.test.ts'),
                tryImport('manifest', 'manifest.ts')
            ]);

            plugin.dataPath = path.join(base, 'data');
        }
    } catch (err) {
        console.warn(`[plugin:${manifest.id}] Failed to load`, err);
    }

    return plugin;
}

import path from 'path';
import { pathToFileURL } from 'url';
import type { HostPluginModule } from '@moteurio/plugin-sdk';
import { readPluginChoices, recordPlugin } from './pluginCatalog.js';

function validateHostPluginModule(plugin: HostPluginModule, spec: string): boolean {
    if (!plugin?.manifest?.id || typeof plugin.init !== 'function') {
        console.warn(`[api] Ignoring plugin "${spec}": invalid manifest/init.`);
        return false;
    }
    if (plugin.manifest.capabilities && !Array.isArray(plugin.manifest.capabilities)) {
        console.warn(`[api] Ignoring plugin "${spec}": invalid manifest capabilities.`);
        return false;
    }
    if (plugin.getRoutes && typeof plugin.getRoutes !== 'function') {
        console.warn(`[api] Ignoring plugin "${spec}": getRoutes must be a function.`);
        return false;
    }
    if (plugin.getAuthProviders && typeof plugin.getAuthProviders !== 'function') {
        console.warn(`[api] Ignoring plugin "${spec}": getAuthProviders must be a function.`);
        return false;
    }
    return true;
}

function parseList(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function resolveSpecifier(specifier: string): string {
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.includes('\\')) {
        const abs = path.resolve(process.cwd(), specifier);
        return pathToFileURL(abs).href;
    }
    return specifier;
}

/**
 * Host-controlled plugin loading:
 * - `MOTEUR_HOST_PLUGINS`: comma-separated import specifiers (npm package names or local paths)
 * - `MOTEUR_ENABLED_PLUGINS`: optional comma-separated plugin ids allowed to run (empty => none)
 * - an operator's saved choices (`data/operator/plugins.json`) switch a plugin on or off over that list
 */
export async function loadHostPluginsFromEnv(): Promise<HostPluginModule[]> {
    const specs = parseList(process.env.MOTEUR_HOST_PLUGINS);
    const enabled = new Set(parseList(process.env.MOTEUR_ENABLED_PLUGINS));
    const hasEnabledFilter = process.env.MOTEUR_ENABLED_PLUGINS !== undefined;
    const choices = readPluginChoices();
    const plugins: HostPluginModule[] = [];

    for (const spec of specs) {
        try {
            const mod = await import(resolveSpecifier(spec));
            const plugin = (mod.default ?? mod) as HostPluginModule;
            if (!validateHostPluginModule(plugin, spec)) {
                continue;
            }
            const { manifest } = plugin;
            const hostAllows = !hasEnabledFilter || enabled.has(manifest.id);
            const running = choices[manifest.id] ?? hostAllows;
            recordPlugin({
                id: manifest.id,
                label: manifest.label,
                description: manifest.description,
                source: manifest.source,
                scope: manifest.scope ?? 'project',
                capabilities: manifest.capabilities,
                role: manifest.role,
                categories: manifest.categories,
                contributions: manifest.contributes,
                requires: manifest.requires,
                studio: manifest.studio,
                kind: 'host',
                spec,
                running,
                hostAllows
            });
            if (!running) continue;
            plugins.push(plugin);
        } catch (err) {
            console.warn(`[api] Failed to load host plugin "${spec}":`, (err as Error).message);
            recordPlugin({
                id: spec,
                label: spec,
                kind: 'host',
                spec,
                running: false,
                hostAllows: false,
                error: (err as Error).message
            });
        }
    }

    return plugins;
}

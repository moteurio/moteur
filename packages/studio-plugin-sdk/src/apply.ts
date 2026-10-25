import type { StudioPluginModule } from './manifest.js';
import { createStudioPluginContext } from './context.js';
import type { StudioHostAdapter } from './types.js';
import { setStudioPluginContributions, StudioContributionCollector } from './contributions.js';

export function defineStudioPlugin(plugin: StudioPluginModule): StudioPluginModule {
    return plugin;
}

/** Register every built-in Studio plugin module against the host adapter. */
export function applyStudioPlugins(modules: StudioPluginModule[], host: StudioHostAdapter): void {
    for (const mod of modules) {
        const collector = new StudioContributionCollector();
        const ctx = createStudioPluginContext(mod.manifest.id, host, collector);
        mod.register(ctx);
        setStudioPluginContributions(mod.manifest.id, mod.manifest, collector.snapshot());
    }
}

import { pluginRegistry } from '../registry/PluginRegistry.js';
import { createPluginContext, setPluginScope, wrapPluginContext } from './pluginContext.js';
import { ContributionCollector } from './contributionCollector.js';
import { registerContentCommitHook } from '../git/contentCommitHook.js';
import type { PluginContributions, PluginManifest } from '@moteurio/types/Plugin.js';
import { mergeContributions } from '@moteurio/types/Plugin.js';
import type { PluginContext } from './pluginContext.js';
import type { HostPluginModule } from '@moteurio/plugin-sdk';

export interface CorePluginModule {
    manifest: PluginManifest;
    init(ctx: PluginContext): void | Promise<void>;
}

const CORE_PLUGIN_IDS = ['activity-log', 'audit', 'validation', 'auto-assign-user'] as const;

const CORE_PLUGIN_ENTRIES: Record<
    (typeof CORE_PLUGIN_IDS)[number],
    () => Promise<{ default: CorePluginModule }>
> = {
    'activity-log': () => import('./core/activityLogPlugin.js'),
    audit: () => import('./core/auditLogger.js'),
    validation: () => import('./core/validation.js'),
    'auto-assign-user': () => import('./core/autoAssignUser.js')
};

function warnContributesMismatch(
    id: string,
    declared: PluginContributions | undefined,
    derived: PluginContributions
): void {
    const declaredBlocks = declared?.schemas?.blocks ?? [];
    if (declaredBlocks.length && !(derived.schemas?.blocks ?? []).length) {
        console.warn(
            `[plugins] Plugin "${id}" declares schemas.blocks but registered none during init.`
        );
    }
    const declaredFields = declared?.schemas?.fields ?? [];
    if (declaredFields.length && !(derived.schemas?.fields ?? []).length) {
        console.warn(
            `[plugins] Plugin "${id}" declares schemas.fields but registered none during init.`
        );
    }
}

function warnMissingRequires(loadedIds: Set<string>): void {
    for (const id of loadedIds) {
        if (!pluginRegistry.has(id)) continue;
        const requires = pluginRegistry.get(id).requires ?? [];
        const missing = requires.filter(dep => !loadedIds.has(dep) && !pluginRegistry.has(dep));
        if (missing.length) {
            console.warn(
                `[plugins] Plugin "${id}" requires ${missing.join(', ')}, which are not loaded.`
            );
        }
    }
}

async function initAndCollect(
    id: string,
    plugin: { manifest: PluginManifest; init: (ctx: PluginContext) => void | Promise<void> }
): Promise<void> {
    const collector = new ContributionCollector();
    const ctx = wrapPluginContext(createPluginContext(), collector, id);
    await Promise.resolve(plugin.init(ctx));
    const derived = collector.snapshot();
    warnContributesMismatch(id, plugin.manifest.contributes, derived);
    pluginRegistry.setContributions(id, mergeContributions(plugin.manifest.contributes, derived));
}

/**
 * Register all core plugin manifests and run their init() to attach event handlers.
 * Idempotent: safe to call once at bootstrap.
 */
export async function registerCorePlugins(): Promise<void> {
    for (const id of CORE_PLUGIN_IDS) {
        const load = CORE_PLUGIN_ENTRIES[id];
        if (!load) continue;

        const mod = await load();
        const plugin = mod.default;
        if (!plugin?.manifest || typeof plugin.init !== 'function') {
            console.warn(`[plugins] Core plugin "${id}" missing manifest or init, skipping.`);
            continue;
        }

        pluginRegistry.register(plugin.manifest.id, plugin.manifest);
        setPluginScope(plugin.manifest.id, 'global');
        await initAndCollect(plugin.manifest.id, plugin);
    }

    // Core: commit and push on content.saved / content.deleted (gated by project.git.enabled)
    registerContentCommitHook();
}

/** Register host-provided plugin modules. Optional plugin composition belongs to the host runtime. */
export async function registerHostPlugins(plugins: HostPluginModule[]): Promise<void> {
    const loaded = new Set<string>(pluginRegistry.list());
    for (const plugin of plugins) {
        const id = plugin?.manifest?.id;
        if (!id) continue;
        if (pluginRegistry.has(id)) {
            continue;
        }
        try {
            if (!plugin?.manifest || typeof plugin.init !== 'function') {
                console.warn(`[plugins] Host plugin "${id}" missing manifest or init, skipping.`);
                continue;
            }
            setPluginScope(id, plugin.manifest.scope ?? 'project');
            pluginRegistry.register(plugin.manifest.id, plugin.manifest);
            await initAndCollect(id, plugin);
            loaded.add(id);
        } catch (err) {
            console.warn(
                `[plugins] Failed to initialize host plugin "${id}":`,
                (err as Error).message
            );
        }
    }
    warnMissingRequires(loaded);
}

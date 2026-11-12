import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { StudioPluginContext } from './context.js';

/**
 * The manifest of a Studio plugin. It has the same catalog fields as an API host plugin
 * (`id`, `label`, `source`, `scope`, `role`, `categories`, `contributes`, `requires`). The `id`
 * must match the paired API plugin. Do not set `kind` or `studio`, because those fields belong to API host plugins.
 */
export type StudioPluginManifest = Pick<
    PluginManifest,
    | 'id'
    | 'label'
    | 'description'
    | 'source'
    | 'scope'
    | 'role'
    | 'categories'
    | 'contributes'
    | 'requires'
> & {
    /** The npm name of this package, for documentation and tooling. */
    packageName?: string;
};

export type StudioPluginModule = {
    manifest: StudioPluginManifest;
    register: (ctx: StudioPluginContext) => void;
};

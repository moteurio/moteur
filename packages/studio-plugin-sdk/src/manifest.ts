import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { StudioPluginContext } from './context.js';

/**
 * Studio companion manifest. Same catalog axes as an API host plugin
 * (`id`, `label`, `source`, `scope`, `role`, `categories`, `contributes`, `requires`).
 * `id` matches the paired API plugin. Omit `kind` / `studio` — those are API-host fields.
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
    /** npm name of this package (documentation / tooling). */
    packageName?: string;
};

export type StudioPluginModule = {
    manifest: StudioPluginManifest;
    register: (ctx: StudioPluginContext) => void;
};

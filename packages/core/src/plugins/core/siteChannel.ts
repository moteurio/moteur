import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { PluginContext } from '../pluginContext.js';
import { createChannel, listChannels } from '../../channels.js';

export const manifest: PluginManifest = {
    id: 'site-channel',
    label: 'Site channel',
    description: 'Gives a new project a "site" channel, so its site can read it with one key',
    source: 'builtin',
    kind: 'core',
    scope: 'global',
    contributes: {
        events: { subscribes: ['project.afterCreate'] }
    }
};

/** What a site reads: its published pages, every model, menus, forms and layouts. */
export const SITE_CHANNEL = {
    id: 'site',
    label: 'Site',
    description: 'What the website reads.',
    resources: [
        { resourceType: 'page' as const, resourceId: 'pages' },
        { resourceType: 'model' as const, resourceId: 'models' },
        { resourceType: 'menu' as const, resourceId: 'menus' },
        { resourceType: 'form' as const, resourceId: 'forms' },
        { resourceType: 'layout' as const, resourceId: 'layouts' }
    ]
};

export function init(ctx: PluginContext): void {
    ctx.onEvent('project.afterCreate', async ({ project, user }) => {
        try {
            // A project cloned from a Git remote may come with channels of its own.
            if ((await listChannels(project.id)).length > 0) return;
            await createChannel(project.id, user, SITE_CHANNEL);
        } catch (err) {
            console.warn(
                `[Moteur] Could not give project "${project.id}" its site channel:`,
                err instanceof Error ? err.message : err
            );
        }
    });
}

export default { manifest, init };

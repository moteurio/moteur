import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { PluginContext } from '../pluginContext.js';

export const manifest: PluginManifest = {
    id: 'auto-assign-user',
    label: 'Auto-assign user',
    description: 'Assigns the creating user to the project when it has no users',
    source: 'builtin',
    kind: 'core'
};

export function init(ctx: PluginContext): void {
    ctx.onEvent('project.beforeCreate', async ({ project, user }) => {
        if (!project.users || project.users.length === 0) {
            if (user) {
                project.users = [user.id];
            }
        }
    });
}

export default { manifest, init };

import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { PluginContext } from '../pluginContext.js';
import {
    log,
    logGlobal,
    toActivityEvent,
    GLOBAL_PROJECT_ID,
    systemUser
} from '../../activityLogger.js';

export const manifest: PluginManifest = {
    id: 'activity-log',
    label: 'Activity log',
    description: 'Records project and resource changes to the activity log',
    source: 'builtin',
    kind: 'core'
};

export function init(ctx: PluginContext): void {
    const created = 'created' as const;
    const updated = 'updated' as const;
    const deleted = 'deleted' as const;

    ctx.onEvent('project.afterCreate', async ({ project, user }) => {
        log(toActivityEvent(project.id, 'project', project.id, created, user));
    });
    ctx.onEvent('project.afterUpdate', async ({ project, user }) => {
        log(toActivityEvent(project.id, 'project', project.id, updated, user));
    });
    ctx.onEvent('project.afterDelete', async ({ project, user }) => {
        log(toActivityEvent(project.id, 'project', project.id, deleted, user));
    });

    ctx.onEvent('model.afterCreate', async ({ model, user, projectId }) => {
        log(toActivityEvent(projectId, 'model', model.id, created, user));
    });
    ctx.onEvent('model.afterUpdate', async ({ model, user, projectId }) => {
        log(toActivityEvent(projectId, 'model', model.id, updated, user));
    });
    ctx.onEvent('model.afterDelete', async ({ model, user, projectId }) => {
        log(toActivityEvent(projectId, 'model', model.id, deleted, user));
    });

    ctx.onEvent('entry.afterCreate', async ({ entry, user, modelId, projectId }) => {
        log(toActivityEvent(projectId, 'entry', `${modelId}__${entry.id}`, created, user));
    });
    ctx.onEvent('entry.afterUpdate', async ({ entry, user, modelId, projectId }) => {
        log(toActivityEvent(projectId, 'entry', `${modelId}__${entry.id}`, updated, user));
    });
    ctx.onEvent('entry.afterDelete', async ({ entry, user, modelId, projectId }) => {
        log(toActivityEvent(projectId, 'entry', `${modelId}__${entry.id}`, deleted, user));
    });

    ctx.onEvent('template.afterCreate', async ({ template, user, projectId }) => {
        log(toActivityEvent(projectId, 'template', template.id, created, user));
    });
    ctx.onEvent('template.afterUpdate', async ({ template, user, projectId }) => {
        log(toActivityEvent(projectId, 'template', template.id, updated, user));
    });
    ctx.onEvent('template.afterDelete', async ({ template, user, projectId }) => {
        log(toActivityEvent(projectId, 'template', template.id, deleted, user));
    });

    ctx.onEvent('page.afterCreate', async ({ page, user, projectId }) => {
        log(toActivityEvent(projectId, 'page', page.id, created, user));
    });
    ctx.onEvent('page.afterUpdate', async ({ page, user, projectId }) => {
        log(toActivityEvent(projectId, 'page', page.id, updated, user));
    });
    ctx.onEvent('page.afterDelete', async ({ page, user, projectId }) => {
        log(toActivityEvent(projectId, 'page', page.id, deleted, user));
    });

    ctx.onEvent('layout.afterCreate', async ({ layout, user, projectId }) => {
        log(toActivityEvent(projectId, 'layout', layout.id, created, user));
    });
    ctx.onEvent('layout.afterUpdate', async ({ layout, user, projectId }) => {
        log(toActivityEvent(projectId, 'layout', layout.id, updated, user));
    });
    ctx.onEvent('layout.afterDelete', async ({ layout, user, projectId }) => {
        log(toActivityEvent(projectId, 'layout', layout.id, deleted, user));
    });

    ctx.onEvent('structure.afterCreate', async ({ structure, user, projectId }) => {
        log(toActivityEvent(projectId, 'structure', structure.type, created, user));
    });
    ctx.onEvent('structure.afterUpdate', async ({ structure, user, projectId }) => {
        log(toActivityEvent(projectId, 'structure', structure.type, updated, user));
    });
    ctx.onEvent('structure.afterDelete', async ({ structure, user, projectId }) => {
        log(toActivityEvent(projectId, 'structure', structure.type, deleted, user));
    });

    ctx.onEvent('user.afterCreate', async ({ user, performedBy }) => {
        const actor = performedBy ?? systemUser();
        logGlobal(toActivityEvent(GLOBAL_PROJECT_ID, 'user', user.id, created, actor));
    });

    ctx.onEvent('blueprint.afterCreate', async ({ blueprint, user }) => {
        logGlobal(toActivityEvent(GLOBAL_PROJECT_ID, 'blueprint', blueprint.id, created, user));
    });
    ctx.onEvent('blueprint.afterUpdate', async ({ blueprint, user }) => {
        logGlobal(toActivityEvent(GLOBAL_PROJECT_ID, 'blueprint', blueprint.id, updated, user));
    });
    ctx.onEvent('blueprint.afterDelete', async ({ blueprint, user }) => {
        logGlobal(toActivityEvent(GLOBAL_PROJECT_ID, 'blueprint', blueprint.id, deleted, user));
    });
}

export default { manifest, init };

import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { PluginContext } from '../pluginContext.js';
import { validateProject } from '../../validators/validateProject.js';
import { validateModel } from '../../validators/validateModel.js';
import { validateTemplate } from '../../validators/validateTemplate.js';
import { assertNoErrors } from '../../utils/validation.js';

export const manifest: PluginManifest = {
    id: 'validation',
    label: 'Validation',
    description: 'Validates project, model, and template schemas before create/update',
    source: 'builtin',
    kind: 'core',
    scope: 'global',
    contributes: {
        events: {
            subscribes: [
                'project.beforeCreate',
                'project.beforeUpdate',
                'model.beforeCreate',
                'model.beforeUpdate',
                'template.beforeCreate',
                'template.beforeUpdate'
            ]
        },
        validation: {
            hooks: ['project', 'model', 'template']
        }
    }
};

export function init(ctx: PluginContext): void {
    ctx.onEvent('project.beforeCreate', async ({ project }) => {
        const result = validateProject(project);
        assertNoErrors('Project', result.issues);
    });

    ctx.onEvent('project.beforeUpdate', async ({ project }) => {
        const result = validateProject(project, {
            existingProjectId: project.id
        });
        assertNoErrors('Project', result.issues);
    });

    ctx.onEvent('model.beforeCreate', async ({ model }) => {
        const result = validateModel(model);
        assertNoErrors('Model', result.issues);
    });

    ctx.onEvent('model.beforeUpdate', async ({ model }) => {
        const result = validateModel(model);
        assertNoErrors('Model', result.issues);
    });

    ctx.onEvent('template.beforeCreate', async ({ template }) => {
        const result = validateTemplate(template);
        assertNoErrors('Template', result.issues);
    });

    ctx.onEvent('template.beforeUpdate', async ({ template }) => {
        const result = validateTemplate(template);
        assertNoErrors('Template', result.issues);
    });
}

export default { manifest, init };

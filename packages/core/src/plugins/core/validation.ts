import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { PluginContext } from '../pluginContext.js';
import { validateProject } from '../../validators/validateProject.js';
import { validateModel } from '../../validators/validateModel.js';
import { validateTemplate } from '../../validators/validateTemplate.js';

export const manifest: PluginManifest = {
    id: 'validation',
    label: 'Validation',
    description: 'Validates project, model, and template schemas before create/update',
    source: 'builtin',
    kind: 'core'
};

export function init(ctx: PluginContext): void {
    ctx.onEvent('project.beforeCreate', async ({ project }) => {
        const result = validateProject(project);
        if (result.issues.length > 0) {
            const errors = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ');
            throw new Error(`Project validation failed: ${errors}`);
        }
    });

    ctx.onEvent('project.beforeUpdate', async ({ project }) => {
        const result = validateProject(project, {
            existingProjectId: project.id
        });
        if (result.issues.length > 0) {
            const errors = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ');
            throw new Error(`Project validation failed: ${errors}`);
        }
    });

    ctx.onEvent('model.beforeCreate', async ({ model }) => {
        const result = validateModel(model);
        if (result.issues.length > 0) {
            const errors = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ');
            throw new Error(`Model validation failed: ${errors}`);
        }
    });

    ctx.onEvent('model.beforeUpdate', async ({ model }) => {
        const result = validateModel(model);
        if (result.issues.length > 0) {
            const errors = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ');
            throw new Error(`Model validation failed: ${errors}`);
        }
    });

    ctx.onEvent('template.beforeCreate', async ({ template }) => {
        const result = validateTemplate(template);
        if (result.issues.length > 0) {
            const errors = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ');
            throw new Error(`Template validation failed: ${errors}`);
        }
    });

    ctx.onEvent('template.beforeUpdate', async ({ template }) => {
        const result = validateTemplate(template);
        if (result.issues.length > 0) {
            const errors = result.issues.map(issue => `${issue.path}: ${issue.message}`).join(', ');
            throw new Error(`Template validation failed: ${errors}`);
        }
    });
}

export default { manifest, init };

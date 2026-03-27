import { describe, it, expect } from 'vitest';
import validationPlugin from '../../../src/plugins/core/validation.js';
import { createPluginContext } from '../../../src/plugins/pluginContext.js';
import { triggerEvent } from '../../../src/utils/eventBus.js';
import { User } from '@moteurio/types/User';
import { ProjectSchema } from '@moteurio/types/Project';
import type { TemplateSchema } from '@moteurio/types/Template.js';

validationPlugin.init(createPluginContext());

describe('coreValidation plugin', () => {
    const user: User = { id: 'user1', email: '', password: '' } as any;

    it('should throw if required fields are missing', async () => {
        const project: ProjectSchema = { id: '', label: '', defaultLocale: 'en' };

        await expect(triggerEvent('project.beforeCreate', { project, user })).rejects.toThrow(
            'Project validation failed'
        );
    });

    it('should pass for valid project', async () => {
        const project: ProjectSchema = { id: 'p1', label: 'Valid', defaultLocale: 'en' };

        await expect(
            triggerEvent('project.beforeCreate', { project, user })
        ).resolves.not.toThrow();
    });

    it('should throw if template is invalid on beforeCreate', async () => {
        const template: TemplateSchema = {
            id: '',
            projectId: 'p1',
            label: 'T',
            fields: {},
            createdAt: '',
            updatedAt: ''
        };

        await expect(
            triggerEvent('template.beforeCreate', { template, user, projectId: 'p1' })
        ).rejects.toThrow('Template validation failed');
    });

    it('should pass for valid template on beforeCreate', async () => {
        const template: TemplateSchema = {
            id: 't1',
            projectId: 'p1',
            label: 'Valid Template',
            fields: { title: { type: 'core/text', label: 'Title', options: {} } },
            createdAt: '',
            updatedAt: ''
        };

        await expect(
            triggerEvent('template.beforeCreate', { template, user, projectId: 'p1' })
        ).resolves.not.toThrow();
    });
});

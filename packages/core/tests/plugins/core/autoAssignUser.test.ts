import { describe, it, expect } from 'vitest';
import autoAssignUser from '../../../src/plugins/core/autoAssignUser.js';
import { createPluginContext } from '../../../src/plugins/pluginContext.js';
import { triggerEvent } from '../../../src/utils/eventBus.js';
import { User } from '@moteurio/types/User';
import { ProjectSchema } from '@moteurio/types/Project';

autoAssignUser.init(createPluginContext());

describe('coreAutoAssignUser plugin', () => {
    const user: User = { id: 'user1', email: '', password: '' } as any;

    it('should assign user to project if no users', async () => {
        const project: ProjectSchema = { id: 'p1', label: 'Test', defaultLocale: 'en' };

        await triggerEvent('project.beforeCreate', { project, user });

        expect(project.users).toEqual([user.id]);
    });

    it('should not overwrite existing users', async () => {
        const project: ProjectSchema = {
            id: 'p1',
            label: 'Test',
            users: ['someone'],
            defaultLocale: 'en'
        };

        await triggerEvent('project.beforeCreate', { project, user });

        expect(project.users).toEqual(['someone']);
    });
});

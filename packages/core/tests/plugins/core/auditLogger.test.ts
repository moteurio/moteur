import { describe, it, expect } from 'vitest';
import auditLogger from '../../../src/plugins/core/auditLogger.js';
import { createPluginContext } from '../../../src/plugins/pluginContext.js';
import { triggerEvent } from '../../../src/utils/eventBus.js';
import { User } from '@moteurio/types/User';
import { ProjectSchema } from '@moteurio/types/Project';

auditLogger.init(createPluginContext());

describe('coreAuditLogger plugin', () => {
    const user: User = { id: 'user1', email: '', password: '' } as any;

    it('should set audit fields on create', async () => {
        const project: ProjectSchema = { id: 'p1', label: 'Test', meta: {}, defaultLocale: 'en' };

        await triggerEvent('project.beforeCreate', { project, user });

        expect(project.meta!.audit).toMatchObject({
            createdBy: user.id,
            updatedBy: user.id,
            revision: 1
        });
    });

    it('should update audit fields on update', async () => {
        const project: ProjectSchema = {
            id: 'p1',
            label: 'Test',
            meta: { audit: { revision: 1, createdBy: 'someone' } },
            defaultLocale: 'en'
        };

        await triggerEvent('project.beforeUpdate', { project, user });

        expect(project.meta?.audit?.revision).toBe(2);
        expect(project.meta?.audit?.updatedBy).toBe(user.id);
    });
});

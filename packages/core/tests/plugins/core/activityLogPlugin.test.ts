import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { triggerEvent } from '../../../src/utils/eventBus.js';
import { getLog, getGlobalLog, GLOBAL_PROJECT_ID } from '../../../src/activityLogger.js';
import { onEvent } from '../../../src/utils/eventBus.js';
import type { ActivityEvent } from '@moteurio/types/Activity.js';
import type { User } from '@moteurio/types/User.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { Layout } from '@moteurio/types/Layout.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';

import activityLogPlugin from '../../../src/plugins/core/activityLogPlugin.js';
import { createPluginContext } from '../../../src/plugins/pluginContext.js';

activityLogPlugin.init(createPluginContext());

function waitForActivityLogged(timeoutMs = 500): Promise<ActivityEvent> {
    return new Promise((resolve, reject) => {
        const t = globalThis.setTimeout(
            () => reject(new Error('timeout waiting for activity.logged')),
            timeoutMs
        );
        onEvent('activity.logged', async ctx => {
            globalThis.clearTimeout(t);
            resolve(ctx.event);
        });
    });
}

describe('activityLogPlugin', () => {
    let tempDir: string;
    const projectId = 'plugin-activity-proj';
    const user: User = {
        id: 'user-1',
        name: 'Test User',
        email: 'test@test.com',
        isActive: true,
        roles: [],
        projects: []
    };
    let originalDataRoot: string | undefined;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-activity-plugin-'));
        const projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'Test', defaultLocale: 'en' }),
            'utf-8'
        );
        originalDataRoot = process.env.DATA_ROOT;
        process.env.DATA_ROOT = tempDir;
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    it('logs entry.afterCreate and persists with modelId__entryId resourceId', async () => {
        const entry: Entry = { id: 'entry-1', title: 'Hello' } as Entry;
        const modelId = 'article';

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('entry.afterCreate', { entry, user, modelId, projectId });
        await loggedPromise;

        const events = await getLog(projectId, 'entry', `${modelId}__${entry.id}`);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            projectId,
            resourceType: 'entry',
            resourceId: 'article__entry-1',
            action: 'created',
            userId: user.id,
            userName: user.name
        });
    });

    it('logs entry.afterUpdate', async () => {
        const entry: Entry = { id: 'e2', title: 'Updated' } as Entry;
        const modelId = 'blog';

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('entry.afterUpdate', { entry, user, modelId, projectId });
        await loggedPromise;

        const events = await getLog(projectId, 'entry', 'blog__e2');
        expect(events).toHaveLength(1);
        expect(events[0].action).toBe('updated');
    });

    it('logs project.afterCreate', async () => {
        const project: ProjectSchema = {
            id: projectId,
            label: 'My Project',
            defaultLocale: 'en'
        };

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('project.afterCreate', { project, user });
        await loggedPromise;

        const events = await getLog(projectId, 'project', projectId);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            resourceType: 'project',
            resourceId: projectId,
            action: 'created',
            userId: user.id
        });
    });

    it('logs model.afterCreate', async () => {
        const model: ModelSchema = {
            id: 'news',
            label: 'News',
            fields: {}
        };

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('model.afterCreate', { model, user, projectId });
        await loggedPromise;

        const events = await getLog(projectId, 'model', 'news');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            resourceType: 'model',
            resourceId: 'news',
            action: 'created'
        });
    });

    it('logs layout.afterCreate', async () => {
        const layout: Layout = {
            id: 'home-page',
            label: 'Home',
            blocks: []
        } as Layout;

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('layout.afterCreate', { layout, user, projectId });
        await loggedPromise;

        const events = await getLog(projectId, 'layout', 'home-page');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            resourceType: 'layout',
            resourceId: 'home-page',
            action: 'created'
        });
    });

    it('logs structure.afterCreate', async () => {
        const structure: StructureSchema = {
            type: 'core/card',
            label: 'Card',
            fields: {}
        };

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('structure.afterCreate', { structure, user, projectId });
        await loggedPromise;

        const events = await getLog(projectId, 'structure', 'core/card');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            resourceType: 'structure',
            resourceId: 'core/card',
            action: 'created'
        });
    });

    it('logs user.afterCreate to global activity', async () => {
        const createdUser: User = {
            id: 'new-user-1',
            name: 'New User',
            email: 'new@test.com',
            isActive: true,
            roles: [],
            projects: []
        };

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('user.afterCreate', { user: createdUser, performedBy: user });
        await loggedPromise;

        const page = await getGlobalLog(10);
        expect(
            page.events.some(
                e =>
                    e.resourceType === 'user' &&
                    e.resourceId === 'new-user-1' &&
                    e.action === 'created'
            )
        ).toBe(true);
        const ev = page.events.find(e => e.resourceId === 'new-user-1');
        expect(ev).toMatchObject({
            projectId: GLOBAL_PROJECT_ID,
            resourceType: 'user',
            resourceId: 'new-user-1',
            action: 'created',
            userId: user.id,
            userName: user.name
        });
    });

    it('logs blueprint.afterCreate to global activity', async () => {
        const blueprint = {
            id: 'test-bp',
            name: 'Test Blueprint',
            description: 'For tests'
        };

        const loggedPromise = waitForActivityLogged();
        await triggerEvent('blueprint.afterCreate', { blueprint: blueprint as any, user });
        await loggedPromise;

        const page = await getGlobalLog(10);
        expect(
            page.events.some(
                e =>
                    e.resourceType === 'blueprint' &&
                    e.resourceId === 'test-bp' &&
                    e.action === 'created'
            )
        ).toBe(true);
        const ev = page.events.find(e => e.resourceId === 'test-bp');
        expect(ev).toMatchObject({
            projectId: GLOBAL_PROJECT_ID,
            resourceType: 'blueprint',
            resourceId: 'test-bp',
            action: 'created',
            userId: user.id
        });
    });
});

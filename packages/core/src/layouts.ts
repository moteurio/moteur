import fs from 'fs';
import path from 'path';
import { Layout } from '@moteurio/types/Layout.js';
import { validateLayout } from './validators/validateLayout.js';
import { User } from '@moteurio/types/User.js';
import { isValidId } from './utils/idUtils.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { getProject } from './projects.js';
import { layoutFilePath, trashLayoutDir } from './utils/pathUtils.js';
import { triggerEvent } from './utils/eventBus.js';
import {
    getProjectJson,
    putProjectJson,
    hasProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { layoutKey, layoutListPrefix } from './utils/storageKeys.js';

export async function listLayouts(user: User, projectId: string): Promise<Layout[]> {
    await getProject(user, projectId);
    const ids = await listProjectKeys(projectId, layoutListPrefix());
    const layouts: Layout[] = [];

    for (const id of ids) {
        const layout = await getProjectJson<Layout>(projectId, layoutKey(id));
        if (layout) layouts.push(layout);
    }
    return layouts;
}

export async function getLayout(user: User, projectId: string, id: string): Promise<Layout> {
    await getProject(user, projectId);
    const layout = await getProjectJson<Layout>(projectId, layoutKey(id));
    if (!layout) {
        throw new Error(`Layout ${id} not found in project ${projectId}`);
    }
    return layout;
}

export async function hasLayout(projectId: string, id: string): Promise<boolean> {
    return hasProjectKey(projectId, layoutKey(id));
}

export async function createLayout(user: User, projectId: string, layout: Layout): Promise<Layout> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    if (!layout.id || !isValidId(layout.id)) {
        throw new Error(`Invalid layout ID: "${layout.id}"`);
    }

    const projectLocales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
        Boolean
    );
    const result = validateLayout(layout, { projectId, projectLocales });
    if (result.issues.length > 0) {
        throw new Error(
            `Layout validation failed: ${result.issues.map(issue => issue.message).join(', ')}`
        );
    }

    const exists = await hasProjectKey(projectId, layoutKey(layout.id));
    if (exists) {
        throw new Error(`Layout with ID "${layout.id}" already exists in project "${projectId}"`);
    }

    triggerEvent('layout.beforeCreate', { layout, user, projectId });
    await putProjectJson(projectId, layoutKey(layout.id), layout);
    triggerEvent('content.saved', {
        projectId,
        paths: [layoutKey(layout.id)],
        message: `Create layout ${layout.id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('layout.afterCreate', { layout, user, projectId });
    return layout;
}

export async function updateLayout(
    user: User,
    projectId: string,
    id: string,
    patch: Partial<Layout>
): Promise<Layout> {
    const project = await getProject(user, projectId);

    if (!id || !isValidId(id)) {
        throw new Error(`Invalid layout ID: ${id}`);
    }

    const current = await getProjectJson<Layout>(projectId, layoutKey(id));
    if (!current) {
        throw new Error(`Layout ${id} does not exist in project ${projectId}`);
    }
    const updated = { ...current, ...patch };
    if (updated.meta?.audit) {
        updated.meta.audit.revision = (current.meta?.audit?.revision ?? 0) + 1;
    }
    const projectLocales = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
        Boolean
    );
    const result = validateLayout(updated, { projectId, projectLocales });
    if (result.issues.length > 0) {
        throw new Error(
            `Layout validation failed: ${result.issues.map(issue => issue.message).join(', ')}`
        );
    }
    triggerEvent('layout.beforeUpdate', { layout: updated, user, projectId });
    await putProjectJson(projectId, layoutKey(id), updated);
    triggerEvent('content.saved', {
        projectId,
        paths: [layoutKey(id)],
        message: `Update layout ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('layout.afterUpdate', { layout: updated, user, projectId });
    return updated;
}

export async function deleteLayout(user: User, projectId: string, id: string): Promise<void> {
    const layout = await getLayout(user, projectId, id);

    triggerEvent('layout.beforeDelete', { layout, user, projectId });

    const source = layoutFilePath(projectId, id);
    const destDir = trashLayoutDir(projectId, id);
    const dest = path.join(destDir, `${id}.json`);

    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(source, dest);

    triggerEvent('content.deleted', {
        projectId,
        paths: [layoutKey(id)],
        message: `Delete layout ${id} — ${user.name ?? user.id}`,
        user
    });
    triggerEvent('layout.afterDelete', { layout, user, projectId });
}

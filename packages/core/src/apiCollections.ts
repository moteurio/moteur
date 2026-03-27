import { randomUUID } from 'crypto';
import type { ApiCollection, ApiCollectionResource } from '@moteurio/types/ApiCollection.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from './projects.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { API_COLLECTIONS_KEY } from './utils/storageKeys.js';
import { triggerEvent } from './utils/eventBus.js';
import { isValidId } from './utils/idUtils.js';

async function loadCollections(projectId: string): Promise<ApiCollection[]> {
    const list = (await getProjectJson<ApiCollection[]>(projectId, API_COLLECTIONS_KEY)) ?? [];
    return list;
}

async function saveCollections(projectId: string, list: ApiCollection[]): Promise<void> {
    await putProjectJson(projectId, API_COLLECTIONS_KEY, list);
}

export async function listCollections(projectId: string): Promise<ApiCollection[]> {
    const list = await loadCollections(projectId);
    return list;
}

export async function getCollection(projectId: string, id: string): Promise<ApiCollection | null> {
    const list = await loadCollections(projectId);
    return list.find(c => c.id === id) ?? null;
}

export async function createCollection(
    projectId: string,
    user: User,
    data: { id?: string; label: string; description?: string; resources?: ApiCollectionResource[] }
): Promise<ApiCollection> {
    await getProject(user, projectId);
    const list = await loadCollections(projectId);
    let collectionId: string;
    if (data.id) {
        if (!isValidId(data.id))
            throw new Error(
                `Invalid collection ID "${data.id}". Use letters, numbers, hyphens and underscores only.`
            );
        if (list.some(c => c.id === data.id))
            throw new Error(`A collection with ID "${data.id}" already exists.`);
        collectionId = data.id;
    } else {
        collectionId = randomUUID();
    }
    const now = new Date().toISOString();
    const collection: ApiCollection = {
        id: collectionId,
        projectId,
        label: data.label,
        description: data.description,
        resources: data.resources ?? [],
        createdAt: now,
        updatedAt: now
    };
    list.push(collection);
    await saveCollections(projectId, list);
    triggerEvent('content.saved', {
        projectId,
        paths: [API_COLLECTIONS_KEY],
        message: `Create API collection — ${user.name ?? user.id}`,
        user
    });
    return collection;
}

export async function updateCollection(
    projectId: string,
    user: User,
    id: string,
    patch: Partial<Pick<ApiCollection, 'label' | 'description' | 'resources'>>
): Promise<ApiCollection> {
    await getProject(user, projectId);
    const list = await loadCollections(projectId);
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Collection "${id}" not found`);
    const now = new Date().toISOString();
    const updated: ApiCollection = {
        ...list[idx],
        ...patch,
        updatedAt: now
    };
    list[idx] = updated;
    await saveCollections(projectId, list);
    triggerEvent('content.saved', {
        projectId,
        paths: [API_COLLECTIONS_KEY],
        message: `Update API collection ${id} — ${user.name ?? user.id}`,
        user
    });
    return updated;
}

export async function deleteCollection(projectId: string, user: User, id: string): Promise<void> {
    await getProject(user, projectId);
    const list = await loadCollections(projectId);
    const filtered = list.filter(c => c.id !== id);
    if (filtered.length === list.length) throw new Error(`Collection "${id}" not found`);
    await saveCollections(projectId, filtered);
    triggerEvent('content.saved', {
        projectId,
        paths: [API_COLLECTIONS_KEY],
        message: `Delete API collection ${id} — ${user.name ?? user.id}`,
        user
    });
}

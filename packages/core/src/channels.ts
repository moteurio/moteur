import { randomUUID } from 'crypto';
import type { Channel, ChannelResource } from '@moteurio/types/Channel.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from './projects.js';
import { deleteProjectKey, getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { CHANNELS_KEY, LEGACY_CHANNELS_KEY } from './utils/storageKeys.js';
import { triggerEvent } from './utils/eventBus.js';
import { isValidId } from './utils/idUtils.js';
import { assertCountRoom } from './planLimits.js';
import { systemActor } from './utils/systemActor.js';

async function loadChannels(projectId: string): Promise<Channel[]> {
    const list = await getProjectJson<Channel[]>(projectId, CHANNELS_KEY);
    if (list) return list;
    // Channels were called collections: a project saved before keeps them under the old name.
    const legacy = await getProjectJson<Channel[]>(projectId, LEGACY_CHANNELS_KEY);
    if (!legacy) return [];
    await putProjectJson(projectId, CHANNELS_KEY, legacy);
    await deleteProjectKey(projectId, LEGACY_CHANNELS_KEY);
    triggerEvent('content.saved', {
        projectId,
        paths: [CHANNELS_KEY, LEGACY_CHANNELS_KEY],
        message: 'Rename api-collections.json to channels.json',
        user: systemActor('_moteur', 'Moteur')
    });
    return legacy;
}

async function saveChannels(projectId: string, list: Channel[]): Promise<void> {
    await putProjectJson(projectId, CHANNELS_KEY, list);
}

export async function listChannels(projectId: string): Promise<Channel[]> {
    const list = await loadChannels(projectId);
    return list;
}

export async function getChannel(projectId: string, id: string): Promise<Channel | null> {
    const list = await loadChannels(projectId);
    return list.find(c => c.id === id) ?? null;
}

export async function createChannel(
    projectId: string,
    user: User,
    data: { id?: string; label: string; description?: string; resources?: ChannelResource[] }
): Promise<Channel> {
    await getProject(user, projectId);
    const list = await loadChannels(projectId);
    assertCountRoom(projectId, 'channels', list.length);
    let channelId: string;
    if (data.id) {
        if (!isValidId(data.id))
            throw new Error(
                `Invalid channel ID "${data.id}". Use letters, numbers, hyphens and underscores only.`
            );
        if (list.some(c => c.id === data.id))
            throw new Error(`A channel with ID "${data.id}" already exists.`);
        channelId = data.id;
    } else {
        channelId = randomUUID();
    }
    const now = new Date().toISOString();
    const channel: Channel = {
        id: channelId,
        projectId,
        label: data.label,
        description: data.description,
        resources: data.resources ?? [],
        createdAt: now,
        updatedAt: now
    };
    list.push(channel);
    await saveChannels(projectId, list);
    triggerEvent('content.saved', {
        projectId,
        paths: [CHANNELS_KEY],
        message: `Create API channel — ${user.name ?? user.id}`,
        user
    });
    return channel;
}

export async function updateChannel(
    projectId: string,
    user: User,
    id: string,
    patch: Partial<Pick<Channel, 'label' | 'description' | 'resources'>>
): Promise<Channel> {
    await getProject(user, projectId);
    const list = await loadChannels(projectId);
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Channel "${id}" not found`);
    const now = new Date().toISOString();
    const updated: Channel = {
        ...list[idx],
        ...patch,
        updatedAt: now
    };
    list[idx] = updated;
    await saveChannels(projectId, list);
    triggerEvent('content.saved', {
        projectId,
        paths: [CHANNELS_KEY],
        message: `Update API channel ${id} — ${user.name ?? user.id}`,
        user
    });
    return updated;
}

export async function deleteChannel(projectId: string, user: User, id: string): Promise<void> {
    await getProject(user, projectId);
    const list = await loadChannels(projectId);
    const filtered = list.filter(c => c.id !== id);
    if (filtered.length === list.length) throw new Error(`Channel "${id}" not found`);
    await saveChannels(projectId, filtered);
    triggerEvent('content.saved', {
        projectId,
        paths: [CHANNELS_KEY],
        message: `Delete API channel ${id} — ${user.name ?? user.id}`,
        user
    });
}

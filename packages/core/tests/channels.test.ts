import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Channel } from '@moteurio/types/Channel.js';
import type { User } from '@moteurio/types/User.js';

const store: { channels: Channel[] } = { channels: [] };

vi.mock('../src/projects.js', () => ({ getProject: vi.fn(async () => ({ id: 'p' })) }));
vi.mock('../src/utils/projectStorage.js', () => ({
    getProjectJson: vi.fn(async () => globalThis.structuredClone(store.channels)),
    putProjectJson: vi.fn(async (_projectId: string, _key: string, list: Channel[]) => {
        store.channels = globalThis.structuredClone(list);
    })
}));
vi.mock('../src/utils/eventBus.js', () => ({ triggerEvent: vi.fn() }));
vi.mock('../src/planLimits.js', () => ({ assertCountRoom: vi.fn() }));

import { updateChannel } from '../src/channels.js';

const user = { id: 'u', name: 'Dev' } as User;

const stored: Channel = {
    id: 'site',
    projectId: 'p',
    label: 'Site',
    description: 'The website',
    resources: [{ resourceType: 'page', resourceId: 'pages' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('updateChannel', () => {
    beforeEach(() => {
        store.channels = [globalThis.structuredClone(stored)];
    });

    it('changes the label, description and resources it is sent', async () => {
        const resources = [{ resourceType: 'model' as const, resourceId: 'posts' }];
        const updated = await updateChannel('p', user, 'site', {
            label: 'Blog',
            description: 'Posts only',
            resources
        });
        expect(updated).toMatchObject({ label: 'Blog', description: 'Posts only', resources });
        expect(store.channels[0]).toMatchObject({ label: 'Blog', resources });
    });

    it('ignores the id, project and creation date in the body', async () => {
        const updated = await updateChannel('p', user, 'site', {
            label: 'Site',
            id: 'other',
            projectId: 'elsewhere',
            createdAt: '1999-01-01T00:00:00.000Z'
        } as never);
        expect(updated).toMatchObject({
            id: 'site',
            projectId: 'p',
            createdAt: stored.createdAt
        });
        expect(store.channels.map(c => c.id)).toEqual(['site']);
    });

    it('ignores fields that are not part of a channel', async () => {
        const updated = await updateChannel('p', user, 'site', { secret: 'x' } as never);
        expect(updated).not.toHaveProperty('secret');
    });

    it('refuses an empty label or resources that are not a list', async () => {
        await expect(updateChannel('p', user, 'site', { label: '  ' })).rejects.toThrow(/label/);
        await expect(
            updateChannel('p', user, 'site', { resources: 'pages' } as never)
        ).rejects.toThrow(/list/);
        expect(store.channels[0]).toEqual(stored);
    });

    it('reports a channel that does not exist', async () => {
        await expect(updateChannel('p', user, 'missing', { label: 'X' })).rejects.toThrow(
            /not found/
        );
    });
});

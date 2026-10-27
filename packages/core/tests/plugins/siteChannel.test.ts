import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/channels.js', () => ({ listChannels: vi.fn(), createChannel: vi.fn() }));

import { listChannels, createChannel } from '../../src/channels.js';
import siteChannel, { SITE_CHANNEL } from '../../src/plugins/core/siteChannel.js';
import type { PluginContext } from '../../src/plugins/pluginContext.js';

type Handler = (payload: { project: { id: string }; user: { id: string } }) => Promise<void>;

function created(): Handler {
    let handler: Handler | undefined;
    siteChannel.init({
        onEvent: (_name: string, fn: Handler) => (handler = fn)
    } as unknown as PluginContext);
    return handler!;
}

describe('a new project’s site channel', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is made with the project: pages, models, menus, forms and layouts', async () => {
        vi.mocked(listChannels).mockResolvedValue([]);
        await created()({ project: { id: 'p' }, user: { id: 'u' } });
        expect(createChannel).toHaveBeenCalledWith('p', { id: 'u' }, SITE_CHANNEL);
        expect(SITE_CHANNEL.resources.map(r => r.resourceType)).toEqual([
            'page',
            'model',
            'menu',
            'form',
            'layout'
        ]);
    });

    it('is not added to a project that came with channels', async () => {
        vi.mocked(listChannels).mockResolvedValue([{ id: 'public' }] as never);
        await created()({ project: { id: 'p' }, user: { id: 'u' } });
        expect(createChannel).not.toHaveBeenCalled();
    });

    it('never stops the project from being made', async () => {
        vi.mocked(listChannels).mockResolvedValue([]);
        vi.mocked(createChannel).mockRejectedValue(new Error('plan limit'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await expect(
            created()({ project: { id: 'p' }, user: { id: 'u' } })
        ).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

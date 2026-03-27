import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@moteurio/types/Asset.js';
import * as projectStorage from '../../src/utils/projectStorage.js';
import { ASSETS_KEY } from '../../src/utils/storageKeys.js';
import { handleProviderWebhook } from '../../src/assets/assetService.js';
import * as providerRegistry from '../../src/assets/providerRegistry.js';

describe('handleProviderWebhook project scope', () => {
    const p1Asset: Asset = {
        id: 'asset-1',
        projectId: 'p1',
        filename: 'v.mp4',
        mimeType: 'video/mp4',
        size: 1,
        type: 'video',
        status: 'processing',
        adapter: 'local',
        uploadedBy: 'u1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        url: '',
        provider: 'mux',
        providerId: 'up_1',
        providerStatus: 'processing',
        providerMetadata: {}
    };

    let getJson: ReturnType<typeof vi.spyOn>;
    let putJson: ReturnType<typeof vi.spyOn>;
    let getProviderForProject: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        getJson = vi.spyOn(projectStorage, 'getProjectJson');
        putJson = vi.spyOn(projectStorage, 'putProjectJson').mockResolvedValue(undefined);
        getProviderForProject = vi.spyOn(providerRegistry, 'getProviderForProject');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('updates only the verified project assets index', async () => {
        getJson.mockImplementation(async (projectId: string, key: string) => {
            if (key !== ASSETS_KEY) return null;
            if (projectId === 'p1') return [p1Asset];
            if (projectId === 'p2') return [{ ...p1Asset, id: 'other', projectId: 'p2' }];
            return [];
        });

        const handleWebhook = vi.fn().mockResolvedValue({
            providerId: 'mux_final',
            providerStatus: 'ready',
            providerMetadata: {},
            correlationId: 'asset-1'
        });

        getProviderForProject.mockResolvedValue({
            handleWebhook
        } as any);

        await handleProviderWebhook('mux', {}, 'sig', { projectId: 'p1', secret: 's' });

        expect(getJson).toHaveBeenCalledWith('p1', ASSETS_KEY);
        expect(getJson).not.toHaveBeenCalledWith('p2', ASSETS_KEY);
        expect(putJson).toHaveBeenCalledTimes(1);
        expect(putJson.mock.calls[0][0]).toBe('p1');
    });
});

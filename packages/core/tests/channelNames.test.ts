import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { putProjectJson, hasProjectKey } from '../src/utils/projectStorage.js';
import { CHANNELS_KEY, LEGACY_CHANNELS_KEY } from '../src/utils/storageKeys.js';
import { listChannels } from '../src/channels.js';
import { verifyProjectApiKey } from '../src/projectApiKey.js';
import { verifyPreviewToken } from '../src/previewTokens.js';

const projectId = 'old-names';
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const rawKey = 'mk_live_' + 'b'.repeat(64);
const rawToken = 'mpv_' + 'c'.repeat(48);

/** A project saved when channels were called collections. */
describe('a project saved before channels had their name', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-channel-names-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(path.join(tempDir, 'data', 'users.json'), '[]');
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Old names',
                defaultLocale: 'en',
                users: [],
                apiKeys: [
                    {
                        id: 'k1',
                        hash: sha(rawKey),
                        prefix: 'mk_live_bbb',
                        createdAt: '2026-01-01T00:00:00.000Z',
                        allowedCollectionIds: ['site']
                    }
                ]
            })
        );
        await putProjectJson(projectId, LEGACY_CHANNELS_KEY, [
            { id: 'site', projectId, label: 'Site', resources: [], createdAt: '', updatedAt: '' }
        ]);
        await putProjectJson(projectId, 'preview-tokens', [
            {
                id: 't1',
                hash: sha(rawToken),
                prefix: 'mpv_cccccc',
                createdAt: '2026-01-01T00:00:00.000Z',
                expiresAt: '2999-01-01T00:00:00.000Z',
                collectionId: 'site'
            }
        ]);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('keeps its channels, moved to the new file', async () => {
        expect((await listChannels(projectId)).map(c => c.id)).toEqual(['site']);
        expect(await hasProjectKey(projectId, CHANNELS_KEY)).toBe(true);
        expect(await hasProjectKey(projectId, LEGACY_CHANNELS_KEY)).toBe(false);
        expect((await listChannels(projectId)).map(c => c.id)).toEqual(['site']);
    });

    it('keeps a key limited to its channels', async () => {
        const result = await verifyProjectApiKey(projectId, rawKey);
        expect(result).toMatchObject({ ok: true, policy: { channelAllowlist: ['site'] } });
    });

    it('keeps a preview link limited to its channel', async () => {
        expect(await verifyPreviewToken(projectId, rawToken)).toMatchObject({
            ok: true,
            channelId: 'site'
        });
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { registerAdapterFactory } from '../../src/assets/adapterRegistry.js';
import type { StorageAdapter } from '../../src/assets/StorageAdapter.js';
import { getAsset, uploadAsset, whenAssetReady } from '../../src/assets/assetService.js';
import {
    checkStorage,
    getProjectMediaSettings,
    moveProjectStorage,
    redactProjectSecrets,
    updateProjectMediaSettings
} from '../../src/assets/mediaSettings.js';
import { getProject, updateProject } from '../../src/projects.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'media-settings';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;
const writer = { ...admin, id: 'u2', name: 'Wes', roles: ['writer'] } as User;

/** A storage kept in memory, standing in for S3: refuses a config without the right secret. */
const bucket = new Map<string, Buffer>();
registerAdapterFactory('memory', config => {
    const c = config as { secret?: string; bucket?: string };
    if (c.secret !== 'open-sesame') throw new Error('Access denied');
    const adapter: StorageAdapter = {
        id: 'memory',
        label: 'Memory',
        async upload(pid, filename, buffer, _mime, variantKey) {
            const p = `${c.bucket}/${pid}/${variantKey ?? 'original'}/${filename}`;
            bucket.set(p, buffer);
            return { path: p, url: `https://cdn.test/${p}` };
        },
        async download(p) {
            const b = bucket.get(p);
            if (!b) throw new Error(`missing ${p}`);
            return b;
        },
        async delete(p) {
            bucket.delete(p);
        },
        async getUrl(p) {
            return `https://cdn.test/${p}`;
        }
    };
    return adapter;
});

const png = () =>
    sharp({ create: { width: 500, height: 300, channels: 3, background: '#48c' } })
        .png()
        .toBuffer();

describe('media settings', () => {
    let tempDir: string;
    beforeEach(async () => {
        bucket.clear();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-media-settings-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('STATIC_ASSETS_BASE_URL', 'http://localhost:3000');
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1', 'u2'] })
        );
        await initRepo(dir);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('lets only admins change them', async () => {
        await expect(
            updateProjectMediaSettings(projectId, writer, { assetConfig: { maxUploadSizeMb: 5 } })
        ).rejects.toMatchObject({ statusCode: 403 });
        await expect(
            checkStorage(projectId, writer, { adapter: 'memory', adapterConfig: {} })
        ).rejects.toMatchObject({ statusCode: 403 });
        const out = await updateProjectMediaSettings(projectId, admin, {
            assetConfig: { maxUploadSizeMb: 5 }
        });
        expect(out.assetConfig.maxUploadSizeMb).toBe(5);
    });

    it('lists what the server offers, with the defaults', async () => {
        const s = await getProjectMediaSettings(projectId, writer);
        expect(s.storages).toEqual(expect.arrayContaining(['local', 'memory']));
        expect(s.storedFiles).toBe(0);
        expect(s.defaults.variants.map(v => v.key)).toEqual(['thumb', 'medium', 'large']);
        expect(s.defaults.types).toContain('image');
    });

    it('refuses bad sizes, limits and kinds', async () => {
        const size = { key: 'card', label: 'Card', fit: 'cover' as const, format: 'webp' as const };
        await expect(
            updateProjectMediaSettings(projectId, admin, { assetConfig: { variants: [size] } })
        ).rejects.toMatchObject({ statusCode: 400, code: 'variants' });
        await expect(
            updateProjectMediaSettings(projectId, admin, {
                assetConfig: { variants: [{ ...size, key: 'Card!', width: 300 }] }
            })
        ).rejects.toMatchObject({ code: 'variants' });
        await expect(
            updateProjectMediaSettings(projectId, admin, {
                assetConfig: { variants: [{ ...size, width: 300, quality: 0 }] }
            })
        ).rejects.toMatchObject({ code: 'variants' });
        await expect(
            updateProjectMediaSettings(projectId, admin, { assetConfig: { maxUploadSizeMb: 0 } })
        ).rejects.toMatchObject({ code: 'max_upload' });
        await expect(
            updateProjectMediaSettings(projectId, admin, {
                assetConfig: { allowedTypes: ['image', 'spreadsheet' as never] }
            })
        ).rejects.toMatchObject({ code: 'allowed_types' });

        const ok = await updateProjectMediaSettings(projectId, admin, {
            assetConfig: { variants: [{ ...size, width: 300 }], allowedTypes: ['image', 'audio'] }
        });
        expect(ok.assetConfig.variants.map(v => v.key)).toEqual(['card']);
        expect(ok.assetConfig.allowedTypes).toEqual(['image', 'audio']);
        // Every kind ticked is no restriction at all.
        const all = await updateProjectMediaSettings(projectId, admin, {
            assetConfig: { allowedTypes: ['image', 'video', 'audio', 'document', 'model'] }
        });
        expect(all.assetConfig.allowedTypes).toBeUndefined();
    });

    it('hides storage and video host secrets, and keeps them when sent back hidden', async () => {
        await updateProjectMediaSettings(projectId, admin, {
            assetConfig: {
                adapter: 'memory',
                adapterConfig: { bucket: 'b1', secret: 'open-sesame' }
            }
        });
        await updateProject(admin, projectId, {
            videoProviders: {
                active: 'mux',
                mux: { tokenId: 'tid', tokenSecret: 'ts', webhookSecret: 'wh' }
            }
        });
        const shown = redactProjectSecrets(await getProject(admin, projectId));
        expect(shown.assetConfig!.adapterConfig).toEqual({ bucket: 'b1', secret: '***' });
        expect(shown.videoProviders!.mux).toEqual({
            tokenId: 'tid',
            tokenSecret: '***',
            webhookSecret: '***'
        });
        const s = await getProjectMediaSettings(projectId, admin);
        expect(JSON.stringify(s)).not.toMatch(/open-sesame|"ts"|"wh"/);

        await updateProjectMediaSettings(projectId, admin, {
            assetConfig: { adapterConfig: { bucket: 'b2', secret: '***' } }
        });
        const stored = await getProject(admin, projectId);
        expect(stored.assetConfig!.adapterConfig).toEqual({ bucket: 'b2', secret: 'open-sesame' });
    });

    it('checks storage settings before saving them', async () => {
        expect(
            await checkStorage(projectId, admin, {
                adapter: 'memory',
                adapterConfig: { bucket: 'b', secret: 'wrong' }
            })
        ).toEqual({ ok: false, error: 'Access denied' });
        expect(
            await checkStorage(projectId, admin, {
                adapter: 'memory',
                adapterConfig: { bucket: 'b', secret: 'open-sesame' }
            })
        ).toEqual({ ok: true });
        expect(bucket.size).toBe(0);
        await expect(
            checkStorage(projectId, admin, { adapter: 'ftp', adapterConfig: {} })
        ).rejects.toMatchObject({ code: 'storage' });
    });

    it('moves the files before switching storage', async () => {
        const doc = await uploadAsset(projectId, admin, {
            buffer: Buffer.from('%PDF-1.4 menu'),
            originalName: 'menu.pdf',
            mimeType: 'application/pdf'
        });
        const pic = await uploadAsset(projectId, admin, {
            buffer: await png(),
            originalName: 'sea.png',
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, pic.id);

        await expect(
            updateProjectMediaSettings(projectId, admin, {
                assetConfig: { adapter: 'memory', adapterConfig: { secret: 'open-sesame' } }
            })
        ).rejects.toMatchObject({ code: 'storage_has_files' });
        await expect(
            moveProjectStorage(projectId, admin, {
                adapter: 'memory',
                adapterConfig: { bucket: 'b', secret: 'nope' }
            })
        ).rejects.toMatchObject({ code: 'storage_check' });
        expect((await getProject(admin, projectId)).assetConfig?.adapter ?? 'local').toBe('local');

        const out = await moveProjectStorage(projectId, admin, {
            adapter: 'memory',
            adapterConfig: { bucket: 'b', secret: 'open-sesame' }
        });
        expect(out.moved).toBe(2);
        expect((await getProject(admin, projectId)).assetConfig!.adapter).toBe('memory');

        const movedDoc = (await getAsset(projectId, doc.id))!;
        expect(movedDoc.adapter).toBe('memory');
        expect(movedDoc.url).toMatch(/^https:\/\/cdn\.test\/b\/media-settings\/original\//);
        expect(bucket.get(movedDoc.path!)!.toString()).toBe('%PDF-1.4 menu');

        await whenAssetReady(projectId, pic.id);
        const movedPic = (await getAsset(projectId, pic.id))!;
        expect(movedPic.url).toMatch(/^https:\/\/cdn\.test\//);
        expect(movedPic.variants!.every(v => v.url.startsWith('https://cdn.test/'))).toBe(true);
    });
});

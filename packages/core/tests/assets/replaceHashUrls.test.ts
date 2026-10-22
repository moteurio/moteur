import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { getProjectAdapter } from '../../src/assets/adapterRegistry.js';
import {
    deleteAsset,
    fileHash,
    getAsset,
    listAssets,
    replaceAssetFile,
    updateAsset,
    uploadAsset,
    whenAssetReady
} from '../../src/assets/assetService.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { ASSETS_KEY } from '../../src/utils/storageKeys.js';
import type { Asset } from '@moteurio/types/Asset.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'media-replace';
const user = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

const png = (width: number, height: number, background = '#c84') =>
    sharp({ create: { width, height, channels: 3, background } })
        .png()
        .toBuffer();
const pdf = (text: string) => ({
    buffer: Buffer.from(`%PDF-1.4 ${text}`),
    originalName: `${text}.pdf`,
    mimeType: 'application/pdf'
});

describe('replacing files, fingerprints and addresses', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-media-replace-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('STATIC_ASSETS_BASE_URL', 'http://localhost:3000');
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        await initRepo(dir);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('stores addresses without the server, and serves them from wherever the API is now', async () => {
        const a = await uploadAsset(projectId, user, {
            buffer: await png(600, 300),
            originalName: 'wide.png',
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, a.id);
        const stored = (await getProjectJson<Asset[]>(projectId, ASSETS_KEY))!.find(
            x => x.id === a.id
        )!;
        expect(stored.localUrl).toMatch(/^\/static\/assets\//);
        expect(stored.variants!.every(v => v.url.startsWith('/static/assets/'))).toBe(true);

        expect((await getAsset(projectId, a.id))!.url).toMatch(
            /^http:\/\/localhost:3000\/static\/assets\//
        );
        vi.stubEnv('STATIC_ASSETS_BASE_URL', 'https://cms.example.org');
        vi.stubEnv('API_BASE_PATH', '/api');
        const moved = (await getAsset(projectId, a.id))!;
        expect(moved.url).toMatch(/^https:\/\/cms\.example\.org\/api\/static\/assets\//);
        expect(moved.variants!.every(v => v.url.startsWith('https://cms.example.org/api/'))).toBe(
            true
        );
    });

    it('fixes addresses stored with an old server', async () => {
        await putProjectJson(projectId, ASSETS_KEY, [
            {
                id: 'old',
                projectId,
                filename: 'old.pdf',
                mimeType: 'application/pdf',
                size: 3,
                type: 'document',
                status: 'ready',
                adapter: 'local',
                path: `${projectId}/original/old.pdf`,
                localUrl: `http://localhost:3000/static/assets/${projectId}/original/old.pdf`,
                uploadedBy: 'u1',
                uploadedByName: 'Ada',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z'
            }
        ]);
        vi.stubEnv('STATIC_ASSETS_BASE_URL', 'https://cms.example.org');
        expect((await getAsset(projectId, 'old'))!.url).toBe(
            `https://cms.example.org/static/assets/${projectId}/original/old.pdf`
        );
    });

    it('finds the same file uploaded before, even in the bin', async () => {
        const file = pdf('report');
        const a = await uploadAsset(projectId, user, file);
        expect(a.hash).toBe(fileHash(file.buffer));
        expect(
            (await listAssets(projectId, { hash: fileHash(file.buffer) })).map(x => x.id)
        ).toEqual([a.id]);
        await deleteAsset(projectId, user, a.id);
        const [binned] = await listAssets(projectId, { hash: fileHash(file.buffer) });
        expect(binned.deletedAt).toBeDefined();
        expect(await listAssets(projectId, { hash: fileHash(pdf('other').buffer) })).toEqual([]);
    });

    it('puts a new picture under the same id, keeping what was written about it', async () => {
        const a = await uploadAsset(projectId, user, {
            buffer: await png(400, 400, '#f00'),
            originalName: 'logo.png',
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, a.id);
        await updateAsset(projectId, user, a.id, { alt: 'Our logo', credit: 'Studio' });
        const before = (await getAsset(projectId, a.id))!;

        const next = await png(800, 200, '#00f');
        const replaced = await replaceAssetFile(projectId, user, a.id, {
            buffer: next,
            originalName: 'logo-2026.png',
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, a.id);
        const after = (await getAsset(projectId, a.id))!;

        expect(replaced.id).toBe(a.id);
        expect([after.filename, after.width, after.height]).toEqual(['logo-2026.png', 800, 200]);
        expect([after.alt, after.credit]).toEqual(['Our logo', 'Studio']);
        expect(after.hash).toBe(fileHash(next));
        expect(after.status).toBe('ready');
        expect(after.variants!.some(v => v.key === 'thumb')).toBe(true);
        expect(after.url).not.toBe(before.url);
        const adapter = getProjectAdapter({ id: projectId } as never);
        await expect(adapter.download(before.path!)).rejects.toThrow();
        await expect(adapter.download(after.path!)).resolves.toBeDefined();
    });

    it('replaces a picture only with a picture', async () => {
        const a = await uploadAsset(projectId, user, {
            buffer: await png(40, 40),
            originalName: 'p.png',
            mimeType: 'image/png'
        });
        await expect(replaceAssetFile(projectId, user, a.id, pdf('notes'))).rejects.toThrow(
            /only be replaced by another image/
        );
        const doc = await uploadAsset(projectId, user, pdf('a'));
        const r = await replaceAssetFile(projectId, user, doc.id, pdf('b'));
        expect([r.id, r.filename]).toEqual([doc.id, 'b.pdf']);
    });
});

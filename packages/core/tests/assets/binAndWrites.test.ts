import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { getProjectAdapter } from '../../src/assets/adapterRegistry.js';
import {
    binAssets,
    deleteAsset,
    deleteAssetForever,
    emptyBin,
    getAsset,
    listAssets,
    listBinnedAssets,
    restoreAsset,
    restoreAssets,
    updateAsset,
    updateAssets,
    uploadAsset,
    whenAssetReady
} from '../../src/assets/assetService.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'media-bin';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;
const editor = { ...admin, id: 'u2', name: 'Eddie', roles: ['writer'] } as User;

const text = (name: string) => ({
    buffer: Buffer.from(`%PDF-1.4 ${name}`),
    originalName: name,
    mimeType: 'application/pdf'
});
const png = (width = 64, height = 32) =>
    sharp({ create: { width, height, channels: 3, background: '#c84' } })
        .png()
        .toBuffer();

describe('media writes, bin and photo metadata', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-media-bin-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'en',
                users: ['u1', 'u2'],
                assetConfig: { variants: [], allowedTypes: ['image', 'document'] }
            })
        );
        await initRepo(dir);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('keeps every change when uploads, image copies and edits happen at once', async () => {
        const first = await uploadAsset(projectId, admin, text('a.pdf'));
        const results = await Promise.all([
            ...Array.from({ length: 6 }, (_, i) =>
                uploadAsset(projectId, admin, text(`f${i}.pdf`))
            ),
            uploadAsset(projectId, admin, {
                buffer: await png(),
                originalName: 'p.png',
                mimeType: 'image/png'
            }),
            updateAsset(projectId, admin, first.id, { credit: 'Ada' })
        ]);
        await whenAssetReady(projectId, results[6].id);
        const all = await listAssets(projectId);
        expect(all).toHaveLength(8);
        expect(all.find(a => a.id === first.id)?.credit).toBe('Ada');
        expect(all.find(a => a.id === results[6].id)?.status).toBe('ready');
    });

    it('puts a deleted asset in the bin, and brings it back', async () => {
        const a = await uploadAsset(projectId, editor, text('a.pdf'));
        await deleteAsset(projectId, editor, a.id);

        expect(await listAssets(projectId)).toEqual([]);
        expect(await getAsset(projectId, a.id)).toBeNull();
        const bin = await listBinnedAssets(projectId, editor);
        expect(bin.map(x => [x.id, x.deletedBy, x.deletedByName])).toEqual([[a.id, 'u2', 'Eddie']]);

        const back = await restoreAsset(projectId, editor, a.id);
        expect(back.deletedAt).toBeUndefined();
        expect((await getAsset(projectId, a.id))?.id).toBe(a.id);
        expect(await listBinnedAssets(projectId, editor)).toEqual([]);
    });

    it('bins and brings back several at once, or none when one is missing', async () => {
        const a = await uploadAsset(projectId, editor, text('a.pdf'));
        const b = await uploadAsset(projectId, editor, text('b.pdf'));
        const c = await uploadAsset(projectId, editor, text('c.pdf'));

        await expect(binAssets(projectId, editor, [a.id, 'nope'])).rejects.toThrow(/not found/);
        expect(await listAssets(projectId)).toHaveLength(3);
        await expect(binAssets(projectId, editor, [])).rejects.toMatchObject({ statusCode: 400 });

        const binned = await binAssets(projectId, editor, [a.id, b.id, a.id]);
        expect(binned.map(x => x.id)).toEqual([a.id, b.id]);
        expect((await listAssets(projectId)).map(x => x.id)).toEqual([c.id]);
        // Binned in the same moment, so they stay together in the bin.
        expect(
            new Set((await listBinnedAssets(projectId, editor)).map(x => x.deletedAt)).size
        ).toBe(1);

        await expect(restoreAssets(projectId, editor, [a.id, c.id])).rejects.toThrow(/in the bin/);
        await restoreAssets(projectId, editor, [a.id, b.id]);
        expect(await listAssets(projectId)).toHaveLength(3);
        expect(await listBinnedAssets(projectId, editor)).toEqual([]);
    });

    it('changes several assets in one go: folder, alt text per file', async () => {
        const a = await uploadAsset(projectId, editor, text('a.pdf'));
        const b = await uploadAsset(projectId, editor, text('b.pdf'));

        await expect(
            updateAssets(projectId, editor, [
                { id: a.id, patch: { folder: 'Menus' } },
                { id: b.id, patch: { focalPoint: { x: 2, y: 0 } } }
            ])
        ).rejects.toThrow(/focalPoint/);
        expect((await getAsset(projectId, a.id))?.folder).toBeUndefined();

        const out = await updateAssets(projectId, editor, [
            { id: a.id, patch: { folder: 'Menus', alt: { en: 'Lunch menu' } } },
            { id: b.id, patch: { folder: 'Menus', alt: { en: 'Dinner menu', fr: '' } } }
        ]);
        expect(out.map(x => [x.folder, x.alt])).toEqual([
            ['Menus', { en: 'Lunch menu' }],
            ['Menus', { en: 'Dinner menu' }]
        ]);
        expect((await listAssets(projectId, { folder: 'Menus' })).length).toBe(2);
    });

    it('lets only an admin delete for good, files included', async () => {
        const a = await uploadAsset(projectId, admin, text('a.pdf'));
        const b = await uploadAsset(projectId, admin, text('b.pdf'));
        await deleteAsset(projectId, editor, a.id);
        await deleteAsset(projectId, editor, b.id);

        await expect(deleteAssetForever(projectId, editor, a.id)).rejects.toThrow(/admin/);
        await expect(emptyBin(projectId, editor)).rejects.toThrow(/admin/);

        const project = JSON.parse(
            await fs.readFile(
                path.join(tempDir, 'data', 'projects', projectId, 'project.json'),
                'utf-8'
            )
        );
        await deleteAssetForever(projectId, admin, a.id);
        await expect(getProjectAdapter(project).download(a.path!)).rejects.toThrow();
        expect(await emptyBin(projectId, admin)).toBe(1);
        expect(await listBinnedAssets(projectId, admin)).toEqual([]);
        // Only assets in the bin can be deleted for good.
        const c = await uploadAsset(projectId, admin, text('c.pdf'));
        await expect(deleteAssetForever(projectId, admin, c.id)).rejects.toThrow(/bin/);
    });

    it('keeps the picture but not where it was taken', async () => {
        // Stored sideways (orientation 6) with the camera owner's name in its EXIF.
        const photo = await sharp(await png(80, 40))
            .withExif({ IFD0: { Artist: 'Ada Lovelace', Copyright: 'Ada' } })
            .withMetadata({ orientation: 6 })
            .jpeg()
            .toBuffer();
        expect((await sharp(photo).metadata()).exif).toBeDefined();

        const a = await uploadAsset(projectId, admin, {
            buffer: photo,
            originalName: 'phone.jpg',
            mimeType: 'image/jpeg'
        });
        const project = { id: projectId } as never;
        const stored = await getProjectAdapter(project).download(a.path!);
        const meta = await sharp(stored).metadata();
        expect(meta.exif).toBeUndefined();
        expect(meta.orientation ?? 1).toBe(1);
        // Turned upright: what was 80×40 sideways is stored 40×80.
        expect([meta.width, meta.height]).toEqual([40, 80]);
        expect(a.size).toBe(stored.length);
    });

    it('keeps a picture with nothing to remove byte for byte', async () => {
        const plain = await png();
        const a = await uploadAsset(projectId, admin, {
            buffer: plain,
            originalName: 'plain.png',
            mimeType: 'image/png'
        });
        const stored = await getProjectAdapter({ id: projectId } as never).download(a.path!);
        expect(stored.equals(plain)).toBe(true);
    });
});

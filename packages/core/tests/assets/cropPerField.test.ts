import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { uploadAsset, whenAssetReady } from '../../src/assets/assetService.js';
import { resolveEntryAssets } from '../../src/assets/assetResolver.js';
import { getResizedImage, parseResizeRequest } from '../../src/assets/resize.js';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'crop-field';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

describe('a field cropping its pictures', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-crop-'));
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

    it('hands sites a crop address in the field’s shape, which the server makes', async () => {
        const pic = await uploadAsset(projectId, admin, {
            buffer: await sharp({
                create: { width: 1200, height: 900, channels: 3, background: '#4a8' }
            })
                .png()
                .toBuffer(),
            originalName: 'quai.png',
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, pic.id);
        const model = {
            id: 'article',
            label: 'Article',
            fields: {
                cover: { type: 'core/asset', label: 'Cover', options: { aspectRatio: '16:9' } },
                gallery: {
                    type: 'core/asset-list',
                    label: 'Gallery',
                    options: { aspectRatio: '1:1' }
                },
                plain: { type: 'core/asset', label: 'Plain' },
                odd: { type: 'core/asset', label: 'Odd', options: { aspectRatio: '5:4' } }
            }
        } as unknown as ModelSchema;
        const value = { assetId: pic.id };
        const entry = {
            id: 'e1',
            data: { cover: value, gallery: [value], plain: value, odd: value }
        } as unknown as Entry;

        const { data } = await resolveEntryAssets(projectId, entry, model);
        expect(data.cover.aspectRatio).toBe('16:9');
        expect(data.cover.cropUrl).toMatch(/\/resize\/crop-field\/.+\?v=\w+&ar=16:9$/);
        expect(data.gallery[0].cropUrl).toMatch(/&ar=1:1$/);
        expect(data.plain.cropUrl).toBeUndefined();
        // A shape the server doesn't make is ignored rather than handed out broken.
        expect(data.odd.cropUrl).toBeUndefined();

        const query = Object.fromEntries(new URL(`${data.cover.cropUrl}&w=640`).searchParams);
        const made = await getResizedImage(projectId, pic.id, parseResizeRequest(query));
        const shape = await sharp(made.buffer).metadata();
        expect([shape.width, shape.height]).toEqual([640, 360]);
    });
});

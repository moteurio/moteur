import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { generateVariants, readImageShape } from '../../src/assets/imageTransformer.js';
import { DEFAULT_IMAGE_VARIANTS } from '../../src/assets/defaultVariants.js';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import {
    deleteAsset,
    deleteAssetForever,
    getAsset,
    resumeImageCopies,
    updateAsset,
    uploadAsset,
    whenAssetReady
} from '../../src/assets/assetService.js';
import {
    clearResizedImages,
    getResizedImage,
    parseResizeRequest
} from '../../src/assets/resize.js';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { ASSETS_KEY } from '../../src/utils/storageKeys.js';
import type { Asset } from '@moteurio/types/Asset.js';

const solid = (width: number, height: number, background = '#c84') =>
    sharp({ create: { width, height, channels: 3, background } })
        .png()
        .toBuffer();

/** Left half red, right half blue. */
const halves = async (width: number, height: number) =>
    sharp(await solid(width, height, '#ff0000'))
        .composite([{ input: await solid(width / 2, height, '#0000ff'), left: width / 2, top: 0 }])
        .png()
        .toBuffer();

const byKey = async (buffer: Buffer, mime: string, focal = { x: 0.5, y: 0.5 }) =>
    Object.fromEntries(
        (await generateVariants(buffer, mime, DEFAULT_IMAGE_VARIANTS, focal)).map(v => [v.key, v])
    );

/** The colour at the middle of an image, as [r, g, b]. */
async function middle(buffer: Buffer): Promise<number[]> {
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const i =
        (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
}

describe('generateVariants', () => {
    it('turns phone photos upright and reports the size people see', async () => {
        // Stored 800×400 with "turn a quarter" (6): it shows as 400×800.
        const phone = await sharp(await solid(800, 400))
            .withMetadata({ orientation: 6 })
            .jpeg()
            .toBuffer();
        expect(await readImageShape(phone)).toEqual({ width: 400, height: 800, animated: false });
        const v = await byKey(phone, 'image/jpeg');
        expect([v.original.width, v.original.height]).toEqual([400, 800]);
        expect([v.medium.width, v.medium.height]).toEqual([400, 800]);
        const meta = await sharp(v.medium.buffer).metadata();
        expect(meta.orientation ?? 1).toBe(1);
    });

    it('never makes a copy bigger than the original', async () => {
        const v = await byKey(await solid(512, 512), 'image/png');
        expect([v.medium.width, v.medium.height]).toEqual([512, 512]);
        expect([v.large.width, v.large.height]).toEqual([512, 512]);
        // A crop smaller than the square asked for keeps its proportions.
        const small = await byKey(await solid(300, 200), 'image/png');
        expect([small.thumb.width, small.thumb.height]).toEqual([200, 200]);
    });

    it('crops around the focal point', async () => {
        const image = await halves(800, 400);
        const left = await byKey(image, 'image/png', { x: 0.1, y: 0.5 });
        const right = await byKey(image, 'image/png', { x: 0.9, y: 0.5 });
        const [r1, , b1] = await middle(left.thumb.buffer);
        const [r2, , b2] = await middle(right.thumb.buffer);
        expect(r1).toBeGreaterThan(200);
        expect(b1).toBeLessThan(50);
        expect(b2).toBeGreaterThan(200);
        expect(r2).toBeLessThan(50);
    });

    it('keeps an animated GIF moving', async () => {
        const frames = await Promise.all(['#f00', '#0f0', '#00f'].map(c => solid(600, 300, c)));
        const gif = await sharp(frames, { join: { animated: true } })
            .gif()
            .toBuffer();
        expect((await readImageShape(gif)).animated).toBe(true);
        const v = await byKey(gif, 'image/gif');
        const meta = await sharp(v.medium.buffer, { animated: true }).metadata();
        expect(meta.pages).toBe(3);
        expect([v.medium.width, v.medium.height]).toEqual([600, 300]);
        expect([v.thumb.width, v.thumb.height]).toEqual([300, 300]);
    });
});

describe('focal point and versioned copies', () => {
    const projectId = 'variants';
    const user = { id: 'u1', name: 'Ada', isActive: true, roles: ['admin'], projects: [projectId] };
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-variants-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        await initRepo(projDir);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('remakes the crops when the focal point moves, under a new version', async () => {
        const first = await uploadAsset(projectId, user, {
            buffer: await halves(800, 400),
            originalName: 'halves.png',
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, first.id);
        const uploaded = (await getAsset(projectId, first.id))!;
        const thumb = (a: typeof uploaded) => a.variants!.find(v => v.key === 'thumb')!;
        const original = (a: typeof uploaded) => a.variants!.find(v => v.key === 'original')!;
        expect(thumb(uploaded).url).toMatch(/\/thumb\/[^/?]+\.webp\?v=[a-z0-9]+$/);
        expect(original(uploaded).url).not.toContain('?v=');

        // Let the clock move so the new version differs.
        await new Promise(r => setTimeout(r, 5));
        const moved = await updateAsset(projectId, user, uploaded.id, {
            focalPoint: { x: 0.9, y: 0.5 }
        });
        expect(moved.focalPoint).toEqual({ x: 0.9, y: 0.5 });
        expect(thumb(moved).url).not.toBe(thumb(uploaded).url);
        expect(original(moved).url).toBe(original(uploaded).url);

        const file = path.join(
            tempDir,
            'data',
            'projects',
            projectId,
            'assets',
            'thumb',
            `${uploaded.id}.webp`
        );
        const [r, , b] = await middle(await fs.readFile(file));
        expect(b).toBeGreaterThan(200);
        expect(r).toBeLessThan(50);

        // Other edits leave the copies alone.
        const titled = await updateAsset(projectId, user, uploaded.id, { title: 'Halves' });
        expect(thumb(titled).url).toBe(thumb(moved).url);
        expect((await getAsset(projectId, uploaded.id))?.title).toBe('Halves');
    });

    const assetsDir = () => path.join(tempDir, 'data', 'projects', projectId, 'assets');
    const upload = async (buffer: Buffer, name = 'pic.png') => {
        const a = await uploadAsset(projectId, user, {
            buffer,
            originalName: name,
            mimeType: 'image/png'
        });
        await whenAssetReady(projectId, a.id);
        return (await getAsset(projectId, a.id))!;
    };

    it('answers the upload at once, then makes the copies in the background', async () => {
        const answered = await uploadAsset(projectId, user, {
            buffer: await solid(1600, 1000),
            originalName: 'wide.png',
            mimeType: 'image/png'
        });
        expect(answered.status).toBe('processing');
        expect([answered.width, answered.height]).toEqual([1600, 1000]);
        expect(answered.variants?.map(v => v.key)).toEqual(['original']);
        expect(answered.resizeUrl).toMatch(
            new RegExp(`/static/resize/${projectId}/${answered.id}\\?v=[a-z0-9]+$`)
        );

        await whenAssetReady(projectId, answered.id);
        const ready = (await getAsset(projectId, answered.id))!;
        expect(ready.status).toBe('ready');
        expect(ready.variants?.map(v => v.key).sort()).toEqual([
            'large',
            'medium',
            'original',
            'thumb'
        ]);
        expect(ready.variants?.find(v => v.key === 'large')?.width).toBe(1600);
    });

    it('finishes images a restart left processing', async () => {
        const done = await upload(await solid(900, 600));
        // As a crash would leave it: original stored, copies missing.
        const list = (await getProjectJson<Asset[]>(projectId, ASSETS_KEY))!;
        list[0] = {
            ...list[0],
            status: 'processing',
            variants: list[0].variants!.filter(v => v.key === 'original')
        };
        await putProjectJson(projectId, ASSETS_KEY, list);

        const project = { id: projectId, label: 'P', defaultLocale: 'en' } as never;
        expect(await resumeImageCopies([project])).toBe(1);
        await whenAssetReady(projectId, done.id);
        const resumed = (await getAsset(projectId, done.id))!;
        expect(resumed.status).toBe('ready');
        expect(resumed.variants).toHaveLength(4);
    });

    it('makes a size once, never wider than the original, and crops around the focal point', async () => {
        const pic = await upload(await halves(800, 400));
        const sized = await getResizedImage(projectId, pic.id, parseResizeRequest({ w: '600' }));
        const meta = await sharp(sized.buffer).metadata();
        expect([meta.width, meta.height, meta.format]).toEqual([640, 320, 'webp']);
        // Wider than the original: served at its own width.
        const big = await getResizedImage(projectId, pic.id, parseResizeRequest({ w: 2000 }));
        expect((await sharp(big.buffer).metadata()).width).toBe(800);

        await updateAsset(projectId, user, pic.id, { focalPoint: { x: 0.9, y: 0.5 } });
        const square = await getResizedImage(
            projectId,
            pic.id,
            parseResizeRequest({ w: '300', ar: '1:1', fmt: 'png' })
        );
        const sq = await sharp(square.buffer).metadata();
        expect([sq.width, sq.height, sq.format]).toEqual([320, 320, 'png']);
        const [r, , b] = await middle(square.buffer);
        expect(b).toBeGreaterThan(200);
        expect(r).toBeLessThan(50);

        // Moving the point cleared the sizes made before it; only the new crop is stored.
        const folder = path.join(assetsDir(), `r-${pic.id}`);
        expect(await fs.readdir(folder)).toEqual(['w320-ar1x1-f90-50.png']);
        // Kept in memory: a second ask is the same answer, with the same tag.
        await fs.writeFile(path.join(folder, 'w320-ar1x1-f90-50.png'), Buffer.from('kept'));
        const ask = () =>
            getResizedImage(
                projectId,
                pic.id,
                parseResizeRequest({ w: 320, ar: '1:1', fmt: 'png' })
            );
        const twice = await ask();
        expect(twice.buffer).toBe(square.buffer);
        expect(twice.etag).toBe(square.etag);
        // Gone from memory (a restart): the stored file is read, not made again.
        clearResizedImages();
        const again = await ask();
        expect(again.buffer.toString()).toBe('kept');
        expect(again.etag).not.toBe(square.etag);
    });

    it("clears an image's sizes when its focal point moves or it is deleted for good", async () => {
        const pic = await upload(await solid(800, 400));
        await getResizedImage(projectId, pic.id, parseResizeRequest({ w: 320, ar: '1:1' }));
        const folder = path.join(assetsDir(), `r-${pic.id}`);
        await expect(fs.readdir(folder)).resolves.toHaveLength(1);
        await updateAsset(projectId, user, pic.id, { focalPoint: { x: 0.2, y: 0.2 } });
        await expect(fs.access(folder)).rejects.toThrow();

        await getResizedImage(projectId, pic.id, parseResizeRequest({ w: 320 }));
        await deleteAsset(projectId, user, pic.id);
        // In the bin, its files stay: it can come back.
        await expect(fs.readdir(folder)).resolves.toHaveLength(1);
        await deleteAssetForever(projectId, user, pic.id);
        await expect(fs.access(folder)).rejects.toThrow();
    });
});

describe('parseResizeRequest', () => {
    it('rounds widths up to the next allowed size and checks ratio and format', () => {
        expect(parseResizeRequest({ w: '600' })).toEqual({
            width: 640,
            ratio: undefined,
            format: 'webp'
        });
        expect(parseResizeRequest({ w: '9000', ar: '16:9', fmt: 'avif' })).toEqual({
            width: 2560,
            ratio: '16:9',
            format: 'avif'
        });
        expect(() => parseResizeRequest({})).toThrow('"w"');
        expect(() => parseResizeRequest({ w: 100, ar: '5:4' })).toThrow('"ar"');
        expect(() => parseResizeRequest({ w: 100, fmt: 'gif' })).toThrow('"fmt"');
    });
});

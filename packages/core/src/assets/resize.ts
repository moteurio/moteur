import { imageWork } from './workLimits.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import { createHash } from 'node:crypto';
import type { Asset } from '@moteurio/types/Asset.js';
import { imageCacheBytes } from '../utils/cacheBudget.js';
import { getProjectJson, getProjectText } from '../utils/projectStorage.js';
import { ASSETS_KEY, PROJECT_KEY } from '../utils/storageKeys.js';
import { getProjectAdapter } from './adapterRegistry.js';
import { resizedFolder } from './assetService.js';
import { generateVariants } from './imageTransformer.js';

/**
 * Sizes made on request (`?w=`): a width is rounded up to the next one, so a site asking for
 * 600 and another asking for 610 share one file, and nobody can make the server produce
 * endless sizes.
 */
export const RESIZE_WIDTHS = [160, 320, 480, 640, 800, 1024, 1280, 1600, 2048, 2560];

/** Proportions a crop can take (`?ar=`), cropped around the focal point. */
export const RESIZE_RATIOS: Record<string, number> = {
    '1:1': 1,
    '4:3': 4 / 3,
    '3:2': 3 / 2,
    '16:9': 16 / 9,
    '21:9': 21 / 9,
    '3:4': 3 / 4,
    '2:3': 2 / 3,
    '9:16': 9 / 16
};

export const RESIZE_FORMATS = ['webp', 'avif', 'jpg', 'png'] as const;
export type ResizeFormat = (typeof RESIZE_FORMATS)[number];

export type ResizeRequest = { width: number; ratio?: string; format: ResizeFormat };

const QUALITY = 80;

/** Reads `w`, `ar` and `fmt` from a query; throws a readable message for anything else. */
export function parseResizeRequest(query: Record<string, unknown>): ResizeRequest {
    const w = Number(query.w);
    if (!Number.isFinite(w) || w <= 0) throw new Error('"w" must be a width in pixels.');
    const width = RESIZE_WIDTHS.find(s => s >= w) ?? RESIZE_WIDTHS[RESIZE_WIDTHS.length - 1];
    const ratio = query.ar === undefined || query.ar === '' ? undefined : String(query.ar);
    if (ratio !== undefined && !RESIZE_RATIOS[ratio])
        throw new Error(`"ar" must be one of ${Object.keys(RESIZE_RATIOS).join(', ')}.`);
    const fmt = query.fmt === undefined || query.fmt === '' ? 'webp' : String(query.fmt);
    if (!(RESIZE_FORMATS as readonly string[]).includes(fmt))
        throw new Error(`"fmt" must be one of ${RESIZE_FORMATS.join(', ')}.`);
    return { width, ratio, format: fmt as ResizeFormat };
}

export class ResizeNotFound extends Error {}

/** A size ready to send: its bytes and a tag naming them (`ETag`), so browsers can ask again for free. */
export type ResizedImage = { buffer: Buffer; format: ResizeFormat; etag: string };

/** What a resize needs to know of an image, read from the project's asset list. */
type ImageFacts = {
    path: string;
    width: number;
    mimeType: string;
    focal: { x: number; y: number };
    version: string;
};

/**
 * Each project's images, parsed once while its asset list stays the same (the file cache says
 * when it changes), for the projects asked about most recently.
 */
const indexes = new Map<string, { text: string; images: Map<string, ImageFacts> }>();
const INDEXES_KEPT = 256;

async function imageFacts(projectId: string, assetId: string): Promise<ImageFacts | undefined> {
    const text = await getProjectText(projectId, ASSETS_KEY).catch(() => null);
    if (text == null) return undefined;
    let kept = indexes.get(projectId);
    if (kept?.text !== text) {
        const images = new Map<string, ImageFacts>();
        let list: Asset[] = [];
        try {
            list = JSON.parse(text);
        } catch {
            // Damaged: nothing to serve until it's fixed.
        }
        for (const a of Array.isArray(list) ? list : []) {
            if (a.type !== 'image' || !a.path || a.deletedAt) continue;
            const made = a.variants?.find(v => v.key !== 'original')?.generatedAt;
            images.set(a.id, {
                path: a.path,
                width: a.width ?? 0,
                mimeType: a.mimeType,
                focal: a.focalPoint ?? { x: 0.5, y: 0.5 },
                // Changes when the file is replaced or its copies rebuilt.
                version: `${a.path}|${a.size}|${a.updatedAt}|${made ?? ''}`
            });
        }
        kept = { text, images };
    }
    indexes.delete(projectId);
    indexes.set(projectId, kept);
    if (indexes.size > INDEXES_KEPT) indexes.delete(indexes.keys().next().value!);
    return kept.images.get(assetId);
}

/** Sizes kept in memory, most recently sent last, within `imageCacheBytes()`. */
const ready = new Map<string, ResizedImage>();
let readyBytes = 0;

function keep(key: string, image: ResizedImage) {
    const budget = imageCacheBytes();
    if (image.buffer.length > budget / 8) return;
    const old = ready.get(key);
    if (old) readyBytes -= old.buffer.length;
    ready.set(key, image);
    readyBytes += image.buffer.length;
    for (const [k, v] of ready) {
        if (readyBytes <= budget) break;
        ready.delete(k);
        readyBytes -= v.buffer.length;
    }
}

/** Forget the sizes kept in memory (tests). */
export function clearResizedImages(): void {
    ready.clear();
    indexes.clear();
    readyBytes = 0;
}

const tagOf = (buffer: Buffer) =>
    `"${createHash('sha1').update(buffer).digest('base64url').slice(0, 22)}"`;

/** Making a size waits behind other image work; this many may wait before a request is told to retry. */
const MAKE_QUEUE = 64;

const inFlight = new Map<string, Promise<ResizedImage>>();

/**
 * An image at a requested size, made once and kept in the project's storage next to its other
 * copies, and the sizes asked for most in memory. The file name holds the focal point, so moving
 * it makes new crops. Only making a size waits for image work: one already made is just read.
 */
export async function getResizedImage(
    projectId: string,
    assetId: string,
    request: ResizeRequest
): Promise<ResizedImage> {
    const facts = await imageFacts(projectId, assetId);
    if (!facts) throw new ResizeNotFound('Not found');

    // Never wider than the original: a small picture is served at its own width.
    const width = Math.min(request.width, facts.width || request.width);
    const f = (n: number) => Math.round(n * 100);
    const name = [
        `w${width}`,
        request.ratio ? `ar${request.ratio.replace(':', 'x')}` : '',
        request.ratio ? `f${f(facts.focal.x)}-${f(facts.focal.y)}` : ''
    ]
        .filter(Boolean)
        .join('-');
    const filename = `${name}.${request.format}`;
    const folder = resizedFolder(assetId);
    const storedPath = `${projectId}/${folder}/${filename}`;

    const key = `${storedPath}|${facts.version}`;
    const hit = ready.get(key);
    if (hit) {
        ready.delete(key);
        ready.set(key, hit);
        return hit;
    }
    const running = inFlight.get(key);
    if (running) return running;

    const job = (async (): Promise<ResizedImage> => {
        const project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
        if (!project) throw new ResizeNotFound('Not found');
        const adapter = getProjectAdapter({ ...project, id: projectId });
        let buffer: Buffer | undefined;
        try {
            buffer = await adapter.download(storedPath);
        } catch {
            // Not made yet.
        }
        buffer ??= await imageWork(async () => {
            const original = await adapter.download(facts.path);
            const ratio = request.ratio ? RESIZE_RATIOS[request.ratio] : undefined;
            const def: VariantDefinition = ratio
                ? {
                      key: 'resized',
                      label: 'Resized',
                      width,
                      height: Math.round(width / ratio),
                      fit: 'cover',
                      format: request.format,
                      quality: QUALITY
                  }
                : {
                      key: 'resized',
                      label: 'Resized',
                      width,
                      fit: 'inside',
                      format: request.format,
                      quality: QUALITY
                  };
            const made = (
                await generateVariants(original, facts.mimeType, [def], facts.focal)
            ).find(v => v.key === 'resized');
            if (!made) throw new Error('The image could not be resized.');
            await adapter.upload(
                projectId,
                filename,
                made.buffer,
                `image/${mime(request.format)}`,
                folder
            );
            return made.buffer;
        }, MAKE_QUEUE);
        const image = { buffer, format: request.format, etag: tagOf(buffer) };
        keep(key, image);
        return image;
    })();
    inFlight.set(key, job);
    try {
        return await job;
    } finally {
        inFlight.delete(key);
    }
}

const mime = (format: ResizeFormat) => (format === 'jpg' ? 'jpeg' : format);
export const resizeContentType = (format: ResizeFormat) => `image/${mime(format)}`;

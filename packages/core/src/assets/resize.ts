import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import { getProjectJson } from '../utils/projectStorage.js';
import { PROJECT_KEY } from '../utils/storageKeys.js';
import { getProjectAdapter } from './adapterRegistry.js';
import { getAsset, resizedFolder } from './assetService.js';
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

const inFlight = new Map<string, Promise<Buffer>>();

/**
 * An image at a requested size, made once and kept in the project's storage next to its other
 * copies. The file name holds the focal point, so moving it makes new crops.
 */
export async function getResizedImage(
    projectId: string,
    assetId: string,
    request: ResizeRequest
): Promise<{ buffer: Buffer; format: ResizeFormat }> {
    const asset = await getAsset(projectId, assetId);
    if (!asset || asset.type !== 'image' || !asset.path) throw new ResizeNotFound('Not found');
    const project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
    if (!project) throw new ResizeNotFound('Not found');
    const adapter = getProjectAdapter({ ...project, id: projectId });

    // Never wider than the original: a small picture is served at its own width.
    const width = Math.min(request.width, asset.width || request.width);
    const focal = asset.focalPoint ?? { x: 0.5, y: 0.5 };
    const f = (n: number) => Math.round(n * 100);
    const name = [
        `w${width}`,
        request.ratio ? `ar${request.ratio.replace(':', 'x')}` : '',
        request.ratio ? `f${f(focal.x)}-${f(focal.y)}` : ''
    ]
        .filter(Boolean)
        .join('-');
    const filename = `${name}.${request.format}`;
    const folder = resizedFolder(asset.id);
    const storedPath = `${projectId}/${folder}/${filename}`;

    const key = `${storedPath}`;
    const running = inFlight.get(key);
    if (running) return { buffer: await running, format: request.format };

    const job = (async () => {
        try {
            return await adapter.download(storedPath);
        } catch {
            // Not made yet.
        }
        const original = await adapter.download(asset.path!);
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
        const made = (await generateVariants(original, asset.mimeType, [def], focal)).find(
            v => v.key === 'resized'
        );
        if (!made) throw new Error('The image could not be resized.');
        await adapter.upload(
            projectId,
            filename,
            made.buffer,
            `image/${mime(request.format)}`,
            folder
        );
        return made.buffer;
    })();
    inFlight.set(key, job);
    try {
        return { buffer: await job, format: request.format };
    } finally {
        inFlight.delete(key);
    }
}

const mime = (format: ResizeFormat) => (format === 'jpg' ? 'jpeg' : format);
export const resizeContentType = (format: ResizeFormat) => `image/${mime(format)}`;

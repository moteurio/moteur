import { type Sharp } from 'sharp';
import { openImage, imageWork, imagePixelLimit } from './workLimits.js';
import type { FocalPoint } from '@moteurio/types/Asset.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';
import { applyMediaTransforms } from '../plugins/mediaPipeline.js';

const RESERVED_ORIGINAL = 'original';

export interface GeneratedVariant {
    key: string;
    buffer: Buffer;
    width: number;
    height: number;
    size: number;
    format: string;
}

/** How an image reads once turned upright, and whether it moves. */
export interface ImageShape {
    width: number;
    height: number;
    animated: boolean;
}

/**
 * The image's size as people see it: phone photos are stored sideways with an orientation tag
 * (5–8 mean a quarter turn), and an animated image's height is one frame, not the whole strip.
 */
export async function readImageShape(buffer: Buffer): Promise<ImageShape> {
    return imageWork(() => readImageShapeUnlimited(buffer));
}

async function readImageShapeUnlimited(buffer: Buffer): Promise<ImageShape> {
    const meta = await openImage(buffer)
        .metadata()
        .catch(error => {
            const tooLarge = /pixel limit/i.test(String(error));
            throw Object.assign(
                new Error(
                    tooLarge ? 'Image exceeds the pixel limit' : 'The image could not be read'
                ),
                {
                    status: tooLarge ? 413 : 415,
                    code: tooLarge ? 'IMAGE_PIXEL_LIMIT' : 'INVALID_IMAGE'
                }
            );
        });
    const animated = (meta.pages ?? 1) > 1;
    const width = meta.width ?? 0;
    const height = animated ? (meta.pageHeight ?? meta.height ?? 0) : (meta.height ?? 0);
    if (width * height * (meta.pages ?? 1) > imagePixelLimit()) {
        throw Object.assign(new Error('Image exceeds the pixel limit'), {
            status: 413,
            code: 'IMAGE_PIXEL_LIMIT'
        });
    }
    const turned = (meta.orientation ?? 1) >= 5;
    return { width: turned ? height : width, height: turned ? width : height, animated };
}

/** Formats whose files can carry camera data (EXIF, XMP, IPTC), and how to save them again. */
const STRIPPABLE: Record<string, (img: Sharp) => Sharp> = {
    'image/jpeg': img => img.jpeg({ quality: 92, mozjpeg: true }),
    'image/png': img => img.png(),
    'image/webp': img => img.webp({ quality: 92 }),
    'image/avif': img => img.avif({ quality: 80 }),
    'image/tiff': img => img.tiff()
};

/**
 * The uploaded picture without what the camera wrote in it: where it was taken (GPS), the
 * camera, its owner's name. It is turned upright first, since the orientation tag goes with
 * the rest; its colour profile stays. A file with nothing to remove is kept byte for byte, and
 * one that can't be read is returned as it came (its copies will fail and say so).
 */
export async function stripImageMetadata(buffer: Buffer, mimeType: string): Promise<Buffer> {
    return imageWork(() => stripImageMetadataUnlimited(buffer, mimeType));
}

async function stripImageMetadataUnlimited(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const save = STRIPPABLE[mimeType];
    if (!save) return buffer;
    try {
        const meta = await openImage(buffer).metadata();
        if (!meta.exif && !meta.xmp && !meta.iptc && (meta.orientation ?? 1) === 1) return buffer;
        const animated = (meta.pages ?? 1) > 1;
        return await save(openImage(buffer, { animated }).rotate().keepIccProfile()).toBuffer();
    } catch (err) {
        console.error('[moteur] Could not remove image metadata', err);
        return buffer;
    }
}

/**
 * Generate image variants. Always includes original (source buffer + metadata).
 * Per-variant errors are logged and skipped; never abort the batch.
 *
 * Every variant is turned upright first (its orientation tag is dropped with the rest of the
 * metadata), is never larger than the original, and keeps an animation when its format can.
 */
/**
 * AVIF's quality scale isn't JPEG's: at the same number it keeps far more detail, in larger files
 * that take many times longer to make. Measured on photos, AVIF at 0.7 of a JPEG/WebP quality looks
 * as good (80 → 56), in about half the bytes of AVIF at 80; effort 2 (of 9) makes it 8 times
 * faster than the default for files a few percent larger.
 */
export function avifOptions(quality: number): { quality: number; effort: number } {
    return { quality: Math.max(1, Math.round(quality * 0.7)), effort: 2 };
}

export async function generateVariants(
    buffer: Buffer,
    mimeType: string,
    definitions: VariantDefinition[],
    focalPoint: FocalPoint,
    projectId?: string
): Promise<GeneratedVariant[]> {
    return imageWork(() =>
        generateVariantsUnlimited(buffer, mimeType, definitions, focalPoint, projectId)
    );
}

async function generateVariantsUnlimited(
    buffer: Buffer,
    mimeType: string,
    definitions: VariantDefinition[],
    focalPoint: FocalPoint,
    projectId?: string
): Promise<GeneratedVariant[]> {
    const results: GeneratedVariant[] = [];
    let shape: ImageShape;
    const source = Buffer.from(
        await applyMediaTransforms(buffer, { projectId, mimeType }, 'source')
    );

    try {
        shape = await readImageShape(source);
    } catch (err) {
        console.error('[moteur] Failed to read image metadata', err);
        return results;
    }

    const allDefs = [...definitions];
    if (!allDefs.some(d => d.key === RESERVED_ORIGINAL)) {
        allDefs.push({
            key: RESERVED_ORIGINAL,
            label: 'Original',
            fit: 'inside',
            format: (mimeType.includes('png') ? 'png' : 'webp') as 'webp' | 'jpg' | 'png' | 'avif'
        });
    }

    // Upright, every frame of an animation; metadata (location, camera) is not carried over.
    const open = (): Sharp => openImage(source, { animated: shape.animated }).rotate();

    for (const def of allDefs) {
        try {
            if (def.key === RESERVED_ORIGINAL) {
                results.push({
                    key: RESERVED_ORIGINAL,
                    buffer: source,
                    width: shape.width,
                    height: shape.height,
                    size: source.length,
                    format: mimeType.split('/')[1] ?? 'webp'
                });
                continue;
            }

            const quality = def.quality ?? 85;
            const fmt = def.format;

            let pipeline: Sharp;
            if (def.fit === 'cover' && def.width && def.height) {
                // A crop is never bigger than the picture: a small image gets a smaller crop
                // with the same proportions instead of a blurry enlargement.
                const shrink = Math.min(1, shape.width / def.width, shape.height / def.height);
                const width = Math.max(1, Math.round(def.width * shrink));
                const height = Math.max(1, Math.round(def.height * shrink));
                const isCentreFocal = focalPoint.x === 0.5 && focalPoint.y === 0.5;
                if (isCentreFocal || shape.animated) {
                    pipeline = open().resize(width, height, { fit: 'cover', position: 'centre' });
                } else {
                    const scale = Math.max(width / shape.width, height / shape.height);
                    const interimW = Math.max(width, Math.round(shape.width * scale));
                    const interimH = Math.max(height, Math.round(shape.height * scale));
                    const left = Math.max(
                        0,
                        Math.min(interimW - width, Math.round(focalPoint.x * interimW - width / 2))
                    );
                    const top = Math.max(
                        0,
                        Math.min(
                            interimH - height,
                            Math.round(focalPoint.y * interimH - height / 2)
                        )
                    );
                    pipeline = open()
                        .resize(interimW, interimH)
                        .extract({ left, top, width, height });
                }
            } else {
                pipeline = open().resize(def.width, def.height, {
                    fit: def.fit,
                    withoutEnlargement: true
                });
            }

            let outBuffer: Buffer;
            if (fmt === 'webp') {
                outBuffer = await pipeline.webp({ quality }).toBuffer();
            } else if (fmt === 'jpg') {
                outBuffer = await pipeline.jpeg({ quality }).toBuffer();
            } else if (fmt === 'png') {
                outBuffer = await pipeline.png({ quality: Math.min(100, quality) }).toBuffer();
            } else if (fmt === 'avif') {
                outBuffer = await pipeline.avif(avifOptions(quality)).toBuffer();
            } else {
                outBuffer = await pipeline.webp({ quality }).toBuffer();
            }

            outBuffer = Buffer.from(
                await applyMediaTransforms(
                    outBuffer,
                    { projectId, mimeType, variantKey: def.key },
                    'variant'
                )
            );
            const out = await readImageShape(outBuffer);
            results.push({
                key: def.key,
                buffer: outBuffer,
                width: out.width,
                height: out.height,
                size: outBuffer.length,
                format: fmt
            });
        } catch (err) {
            console.error(`[moteur] Variant "${def.key}" failed:`, err);
        }
    }

    return results;
}

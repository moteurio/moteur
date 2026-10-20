import sharp, { type Sharp } from 'sharp';
import type { FocalPoint } from '@moteurio/types/Asset.js';
import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';

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
    const meta = await sharp(buffer).metadata();
    const animated = (meta.pages ?? 1) > 1;
    const width = meta.width ?? 0;
    const height = animated ? (meta.pageHeight ?? meta.height ?? 0) : (meta.height ?? 0);
    const turned = (meta.orientation ?? 1) >= 5;
    return { width: turned ? height : width, height: turned ? width : height, animated };
}

/**
 * Generate image variants. Always includes original (source buffer + metadata).
 * Per-variant errors are logged and skipped; never abort the batch.
 *
 * Every variant is turned upright first (its orientation tag is dropped with the rest of the
 * metadata), is never larger than the original, and keeps an animation when its format can.
 */
export async function generateVariants(
    buffer: Buffer,
    mimeType: string,
    definitions: VariantDefinition[],
    focalPoint: FocalPoint
): Promise<GeneratedVariant[]> {
    const results: GeneratedVariant[] = [];
    let shape: ImageShape;

    try {
        shape = await readImageShape(buffer);
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
    const open = (): Sharp => sharp(buffer, { animated: shape.animated }).rotate();

    for (const def of allDefs) {
        try {
            if (def.key === RESERVED_ORIGINAL) {
                results.push({
                    key: RESERVED_ORIGINAL,
                    buffer,
                    width: shape.width,
                    height: shape.height,
                    size: buffer.length,
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
                outBuffer = await pipeline.avif({ quality }).toBuffer();
            } else {
                outBuffer = await pipeline.webp({ quality }).toBuffer();
            }

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

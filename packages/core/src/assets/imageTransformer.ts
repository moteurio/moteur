import sharp from 'sharp';
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

/**
 * Generate image variants. Always includes original (source buffer + metadata).
 * Per-variant errors are logged and skipped; never abort the batch.
 */
export async function generateVariants(
    buffer: Buffer,
    mimeType: string,
    definitions: VariantDefinition[],
    focalPoint: FocalPoint
): Promise<GeneratedVariant[]> {
    const results: GeneratedVariant[] = [];
    let meta: { width: number; height: number } = { width: 0, height: 0 };

    try {
        const metaResult = await sharp(buffer).metadata();
        meta = { width: metaResult.width ?? 0, height: metaResult.height ?? 0 };
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

    for (const def of allDefs) {
        try {
            if (def.key === RESERVED_ORIGINAL) {
                results.push({
                    key: RESERVED_ORIGINAL,
                    buffer,
                    width: meta.width,
                    height: meta.height,
                    size: buffer.length,
                    format: mimeType.split('/')[1] ?? 'webp'
                });
                continue;
            }

            const width = def.width;
            const height = def.height;
            const quality = def.quality ?? 85;
            const fmt = def.format;

            let pipeline: sharp.Sharp;
            if (def.fit === 'cover' && width && height) {
                const isCentreFocal = focalPoint.x === 0.5 && focalPoint.y === 0.5;
                if (isCentreFocal) {
                    pipeline = sharp(buffer).resize(width, height, {
                        fit: 'cover',
                        position: 'centre'
                    });
                } else {
                    const scale = Math.max(width / meta.width, height / meta.height);
                    const interimW = Math.ceil(meta.width * scale);
                    const interimH = Math.ceil(meta.height * scale);
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
                    pipeline = sharp(buffer)
                        .resize(interimW, interimH)
                        .extract({ left, top, width, height });
                }
            } else {
                pipeline = sharp(buffer).resize(width, height, { fit: def.fit });
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

            const outMeta = await sharp(outBuffer).metadata();
            results.push({
                key: def.key,
                buffer: outBuffer,
                width: outMeta.width ?? 0,
                height: outMeta.height ?? 0,
                size: outBuffer.length,
                format: fmt
            });
        } catch (err) {
            console.error(`[moteur] Variant "${def.key}" failed:`, err);
        }
    }

    return results;
}

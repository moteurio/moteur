import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { readImageShape } from '../../src/assets/imageTransformer.js';

describe('image work limits', () => {
    afterEach(() => vi.unstubAllEnvs());
    it('rejects images above the pixel budget before transformation', async () => {
        const input = await sharp({
            create: { width: 100, height: 100, channels: 3, background: 'red' }
        })
            .png()
            .toBuffer();
        vi.stubEnv('MOTEUR_IMAGE_MAX_PIXELS', '100');
        await expect(readImageShape(input)).rejects.toMatchObject({
            status: 413,
            code: 'IMAGE_PIXEL_LIMIT'
        });
    });
    it('returns a client error for an unreadable image', async () => {
        await expect(readImageShape(Buffer.from('not an image'))).rejects.toMatchObject({
            status: 415,
            code: 'INVALID_IMAGE'
        });
    });
});

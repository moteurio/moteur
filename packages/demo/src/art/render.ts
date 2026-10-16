import sharp from 'sharp';

export type RenderFormat = 'png' | 'jpeg' | 'svg';

/** Render generated SVG to the format uploaded to the media library. */
export async function render(svgSource: string, format: RenderFormat): Promise<Buffer> {
    if (format === 'svg') return Buffer.from(svgSource);
    const image = sharp(Buffer.from(svgSource), { density: 72 });
    return format === 'png'
        ? image.png({ compressionLevel: 9 }).toBuffer()
        : image.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/** Contact sheet of rendered images (used by the art preview). */
export async function contactSheet(images: Buffer[], columns = 5, tile = 300): Promise<Buffer> {
    const rows = Math.ceil(images.length / columns);
    const tiles = await Promise.all(
        images.map(b =>
            sharp(b).resize(tile, tile, { fit: 'contain', background: '#777777' }).toBuffer()
        )
    );
    return sharp({
        create: { width: columns * tile, height: rows * tile, channels: 3, background: '#777777' }
    })
        .composite(
            tiles.map((input, i) => ({
                input,
                left: (i % columns) * tile,
                top: Math.floor(i / columns) * tile
            }))
        )
        .jpeg({ quality: 80 })
        .toBuffer();
}

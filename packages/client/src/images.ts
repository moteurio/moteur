/**
 * Responsive images from Moteur assets, without network calls: an asset (or a media field's
 * value read with `resolveAssets=1`) turned into `src`, `srcset`, `width`, `height` and `alt`
 * for an `<img>`. Addresses come from the server (`resizeUrl`, `cropUrl`); these only add the
 * width and format. See docs/Images.md.
 */

/**
 * The widths the server makes (core `RESIZE_WIDTHS`): another width gets the next one up, and
 * nothing is made wider than the original.
 */
export const IMAGE_WIDTHS = [160, 320, 480, 640, 800, 1024, 1280, 1600, 2048, 2560] as const;

/** The shapes the server crops to (core `RESIZE_RATIOS`), around the picture's focal point. */
export const IMAGE_RATIOS = ['1:1', '4:3', '3:2', '16:9', '21:9', '3:4', '2:3', '9:16'] as const;
export type ImageRatio = (typeof IMAGE_RATIOS)[number];
export type ImageFormat = 'webp' | 'avif' | 'jpg' | 'png';

/** Text in one string, or one per language. */
type LocalText = string | Record<string, string> | null | undefined;

/** What these helpers read from an asset. */
export type ImageAsset = {
    url?: string;
    resizeUrl?: string;
    width?: number;
    height?: number;
    focalPoint?: { x: number; y: number };
    alt?: LocalText;
};

/** A media field's value read with `resolveAssets=1`: the field's texts, the asset, its crop. */
export type ResolvedImage = {
    assetId?: string;
    alt?: LocalText;
    caption?: LocalText;
    cropUrl?: string;
    aspectRatio?: string;
    _resolved?: ImageAsset | null;
};

export type ImageSource = ImageAsset | ResolvedImage | null | undefined;

export type ImageOptions = {
    /** Crop to this shape (overrides the field's own crop). */
    ratio?: ImageRatio;
    /** `webp` unless set. */
    format?: ImageFormat;
};

const isResolved = (s: ImageAsset | ResolvedImage): s is ResolvedImage =>
    '_resolved' in s || 'assetId' in s || 'cropUrl' in s;

const ratioValue = (ratio: string) => {
    const [w, h] = ratio.split(':').map(Number);
    return w > 0 && h > 0 ? w / h : undefined;
};

/** The asset, the address to add a width to, and the shape it comes in. */
function read(source: ImageSource, options: ImageOptions = {}) {
    if (!source) return {};
    const asset = isResolved(source) ? (source._resolved ?? undefined) : source;
    const field = isResolved(source) ? source : undefined;
    if (options.ratio && asset?.resizeUrl)
        return {
            asset,
            field,
            base: `${asset.resizeUrl}&ar=${options.ratio}`,
            ratio: options.ratio
        };
    if (field?.cropUrl) return { asset, field, base: field.cropUrl, ratio: field.aspectRatio };
    return { asset, field, base: asset?.resizeUrl, ratio: undefined };
}

/**
 * The picture at a width (rounded up by the server to one of `IMAGE_WIDTHS`), cropped to the
 * field's shape when it asks for one. Without `resizeUrl` (not an image, or an older server):
 * the file as uploaded.
 */
export function imageUrl(
    source: ImageSource,
    width: number,
    options: ImageOptions = {}
): string | undefined {
    const { asset, base } = read(source, options);
    if (!base) return asset?.url;
    return `${base}&w=${Math.round(width)}${options.format ? `&fmt=${options.format}` : ''}`;
}

/**
 * `srcset` for the widths the server makes, up to the original's: `…&w=320 320w, …`. Each
 * descriptor is the width actually served (never wider than the original).
 */
export function imageSrcset(
    source: ImageSource,
    options: ImageOptions & { widths?: readonly number[] } = {}
): string | undefined {
    const { asset, base } = read(source, options);
    if (!base) return undefined;
    const original = asset?.width;
    const out: string[] = [];
    for (const w of [...(options.widths ?? IMAGE_WIDTHS)].sort((a, b) => a - b)) {
        const served = original ? Math.min(w, original) : w;
        if (out.some(s => s.endsWith(` ${served}w`))) continue;
        out.push(`${imageUrl(source, w, options)} ${served}w`);
        if (original && w >= original) break;
    }
    return out.join(', ');
}

/** One language of a text: the one asked for, else the default, else any. */
function textIn(value: LocalText, locale?: string, defaultLocale?: string): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return (
        (locale && value[locale]) ||
        (defaultLocale && value[defaultLocale]) ||
        Object.values(value).find(Boolean) ||
        ''
    );
}

export type ImageAttributes = {
    src?: string;
    srcset?: string;
    sizes?: string;
    /** The picture's shape, so the page doesn't jump while it loads. */
    width?: number;
    height?: number;
    alt: string;
};

/**
 * Everything an `<img>` needs: `<img {...imageAttributes(entry.data.cover, { sizes: '50vw' })}>`.
 * `alt` is the field's own text if it has one, else the asset's, in `locale`; empty when there
 * is none (a decorative picture), never missing.
 */
export function imageAttributes(
    source: ImageSource,
    options: ImageOptions & {
        /** How wide the picture shows, as in `<img sizes>`: `100vw` unless set. */
        sizes?: string;
        widths?: readonly number[];
        /** The width for `src`, for browsers without `srcset` (1024 unless set). */
        fallbackWidth?: number;
        locale?: string;
        defaultLocale?: string;
    } = {}
): ImageAttributes {
    const { asset, field, ratio } = read(source, options);
    const alt = textIn(field?.alt || asset?.alt, options.locale, options.defaultLocale);
    if (!asset) return { alt };
    const shape = ratio ? ratioValue(ratio) : undefined;
    const width = asset.width;
    const height = shape && width ? Math.round(width / shape) : shape ? undefined : asset.height;
    const srcset = imageSrcset(source, options);
    return {
        src: imageUrl(source, Math.min(options.fallbackWidth ?? 1024, width ?? Infinity), options),
        ...(srcset && { srcset, sizes: options.sizes ?? '100vw' }),
        ...(width && height && { width, height }),
        alt
    };
}

/**
 * The focal point as CSS `object-position` ("30% 70%"), for crops made in the page (CSS
 * `object-fit: cover`) to keep what the server's crops keep.
 */
export function focalPosition(source: ImageSource): string {
    const { asset } = read(source);
    const fp = asset?.focalPoint;
    return fp ? `${Math.round(fp.x * 100)}% ${Math.round(fp.y * 100)}%` : '50% 50%';
}

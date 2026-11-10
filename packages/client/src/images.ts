/**
 * Helpers that build responsive image attributes from Moteur assets without making network
 * calls. They turn an asset, or a media field value read with `resolveAssets=1`, into the `src`,
 * `srcset`, `width`, `height` and `alt` attributes of an `<img>`. The base URLs come from the
 * server (`resizeUrl`, `cropUrl`); these helpers only append the width and format. See
 * docs/Images.md.
 */

/**
 * The image widths in pixels that the server can generate (core `RESIZE_WIDTHS`). A requested
 * width that is not in the list is rounded up to the next one, and no image is generated wider than
 * the original.
 */
export const IMAGE_WIDTHS = [160, 320, 480, 640, 800, 1024, 1280, 1600, 2048, 2560] as const;

/** The aspect ratios that the server can crop to (core `RESIZE_RATIOS`), centred on the image's focal point. */
export const IMAGE_RATIOS = ['1:1', '4:3', '3:2', '16:9', '21:9', '3:4', '2:3', '9:16'] as const;
export type ImageRatio = (typeof IMAGE_RATIOS)[number];
export type ImageFormat = 'webp' | 'avif' | 'jpg' | 'png';

/** Text as a single string, or a map from locale code to string. */
type LocalText = string | Record<string, string> | null | undefined;

/** The asset properties that these helpers read. */
export type ImageAsset = {
    url?: string;
    resizeUrl?: string;
    width?: number;
    height?: number;
    focalPoint?: { x: number; y: number };
    alt?: LocalText;
};

/** A media field value read with `resolveAssets=1`. It holds the field's own texts, the resolved asset and the field's crop. */
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
    /** Aspect ratio to crop to. It overrides the field's own crop. */
    ratio?: ImageRatio;
    /** Output format. Defaults to `webp`. */
    format?: ImageFormat;
};

const isResolved = (s: ImageAsset | ResolvedImage): s is ResolvedImage =>
    '_resolved' in s || 'assetId' in s || 'cropUrl' in s;

const ratioValue = (ratio: string) => {
    const [w, h] = ratio.split(':').map(Number);
    return w > 0 && h > 0 ? w / h : undefined;
};

/** Resolves the source into its asset, the base URL that a width is appended to, and the aspect ratio of the crop. */
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
 * Returns the URL of the image at the given width, which the server rounds up to one of
 * `IMAGE_WIDTHS`. The image is cropped to the field's aspect ratio when the field has one. When
 * the asset has no `resizeUrl` (it is not an image, or the server does not provide one), returns
 * the URL of the file as uploaded.
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
 * Returns a `srcset` value for the widths the server generates, up to the original width, for
 * example `…&w=320 320w, …`. Each width descriptor is the width actually served, which is never
 * wider than the original.
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

/** Returns the text in the requested locale, else in the default locale, else in any available locale. */
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
    /** The image's intrinsic dimensions, which let the browser reserve space so the page does not shift while the image loads. */
    width?: number;
    height?: number;
    alt: string;
};

/**
 * Returns all the attributes an `<img>` needs, for example
 * `<img {...imageAttributes(entry.data.cover, { sizes: '50vw' })}>`.
 * `alt` is the field's own text if it has one, otherwise the asset's, in `locale`. It is an empty
 * string when neither exists (a decorative image), so the attribute is always present.
 */
export function imageAttributes(
    source: ImageSource,
    options: ImageOptions & {
        /** The `sizes` attribute value, describing how wide the image is displayed. Defaults to `100vw`. */
        sizes?: string;
        widths?: readonly number[];
        /** Width in pixels used for `src`, for browsers that do not support `srcset`. Defaults to 1024. */
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
 * Returns the focal point as a CSS `object-position` value such as "30% 70%". Use it on images
 * cropped in the page with CSS `object-fit: cover`, so that they keep the same area in view as the
 * server's crops. Defaults to "50% 50%".
 */
export function focalPosition(source: ImageSource): string {
    const { asset } = read(source);
    const fp = asset?.focalPoint;
    return fp ? `${Math.round(fp.x * 100)}% ${Math.round(fp.y * 100)}%` : '50% 50%';
}

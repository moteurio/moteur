# Images

How pictures from the media library reach a site: at any width, cropped to a shape around the
part that matters, cached for good. The server makes every size; your site only picks widths.

---

## 1. The addresses an asset carries

Read entries or pages with `resolveAssets=1` and each media field (`core/asset`,
`core/asset-list`) comes with its asset in `_resolved`:

```json
{
    "assetId": "mprqf21a-uyggsdb8",
    "alt": { "fr": "Le quai au matin" },
    "caption": "",
    "cropUrl": "https://api.example.com/static/resize/demo/mprqf21a-uyggsdb8?v=mvi9kjy8&ar=16:9",
    "aspectRatio": "16:9",
    "_resolved": {
        "url": "https://api.example.com/static/assets/demo/original/…-quai.jpg",
        "resizeUrl": "https://api.example.com/static/resize/demo/mprqf21a-uyggsdb8?v=mvi9kjy8",
        "width": 1200,
        "height": 800,
        "focalPoint": { "x": 0.3, "y": 0.7 },
        "alt": { "fr": "Le quai", "en": "The wharf" }
    }
}
```

| Address     | What it is                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `url`       | The file as uploaded (photos have their location data removed). Any kind of file.                   |
| `resizeUrl` | Images only: the picture at any width. Add `&w=640`.                                                |
| `cropUrl`   | Only when the field is set to crop (`aspectRatio`): the picture in the field's shape. Add `&w=640`. |

`alt` and `caption` at the top are the field's own texts when it has them, else the asset's.

---

## 2. `resizeUrl` and `cropUrl` parameters

| Parameter | Values                                             | Default | Notes                                                                                                                   |
| --------- | -------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `w`       | a width in pixels                                  | —       | Required. Rounded **up** to 160, 320, 480, 640, 800, 1024, 1280, 1600, 2048 or 2560, and never wider than the original. |
| `ar`      | `1:1` `4:3` `3:2` `16:9` `21:9` `3:4` `2:3` `9:16` | none    | Crops to that shape around the **focal point**. Already set in `cropUrl`.                                               |
| `fmt`     | `webp` `avif` `jpg` `png`                          | `webp`  |                                                                                                                         |

Rounding widths keeps the number of files small: a site asking for 600 px and another asking for
610 px share the 640 px file, and nobody can make the server produce endless sizes.

Each size is made **once**, on first request, and kept in the project's storage (local disk, S3,
R2) next to the asset's other files.

### Focal point

Editors mark what a crop must keep (Media library, or "Change what the crop keeps" in a cropped
field). Every crop of the picture follows it, in every shape. Moving it changes `v` in the
addresses, so new crops are made and caches never serve the old ones.

### Caching

Addresses carry `v=…`, which changes whenever the picture or its crops change. Answers to them
are sent with `Cache-Control: public, max-age=31536000, immutable`: a CDN or proxy in front of
the API (Cloudflare, Fastly, CloudFront…) can keep each one for good. Without `v`, answers are
kept for an hour.

---

## 3. Cropping per field

A media field can ask for a shape: **Setup → the model → the field → Options → Crop to**, or in
the schema:

```json
{ "key": "cover", "type": "core/asset", "label": "Cover", "options": { "aspectRatio": "16:9" } }
```

Studio then shows the picture in that shape, as sites will get it, and read with
`resolveAssets=1` the value carries `cropUrl` and `aspectRatio`. The stored content doesn't
change: switch the shape later and every entry follows.

---

## 4. Helpers in `@moteurio/client`

Plain functions, no network calls. They take an asset or a resolved field value.

```ts
import { imageAttributes, imageSrcset, imageUrl, focalPosition } from '@moteurio/client';

const cover = entry.data.cover; // read with resolveAssets: true

imageUrl(cover, 640); //                → cropUrl + &w=640
imageUrl(cover, 640, { ratio: '1:1', format: 'avif' }); // another shape, another format
imageSrcset(cover); //                  → "…&w=160 160w, …&w=320 320w, … 1200w"
focalPosition(cover); //                → "30% 70%" (for CSS object-position)
```

`imageAttributes` gives an `<img>` everything it needs:

```tsx
<img
    {...imageAttributes(cover, { sizes: '(min-width: 60rem) 50vw, 100vw', locale: 'fr' })}
    loading="lazy"
/>
```

```json
{
    "src": "…&ar=16:9&w=1024",
    "srcset": "…&ar=16:9&w=160 160w, … , …&ar=16:9&w=1280 1200w",
    "sizes": "(min-width: 60rem) 50vw, 100vw",
    "width": 1200,
    "height": 675,
    "alt": "Le quai au matin"
}
```

- `srcset` lists the widths the server makes, up to the original's, each described by the width
  actually served.
- `width` and `height` give the shape, so the page doesn't move while the picture loads.
- `alt` is the field's text, else the asset's, in `locale` (then `defaultLocale`, then any).
  It is empty, never missing, when there is none: write alt text in the library.
- Not an image, or no `resizeUrl`: `src` is the file itself and there is no `srcset`.

`IMAGE_WIDTHS` and `IMAGE_RATIOS` list what the server makes.

### In Astro: `<MoteurImage>`

`@moteurio/astro` wraps these in a component:

```astro
---
import MoteurImage from '@moteurio/astro/MoteurImage.astro';
---
<MoteurImage image={page.fields.cover} sizes="(min-width: 60rem) 50vw, 100vw" priority />
<MoteurImage image={author.data.portrait} ratio="1:1" sizes="8rem" />
```

- **Markup:** it writes a `<picture>`, with AVIF as a `<source>` and WebP in the `<img>`.
- **Sizes and shape:** both formats get the full `srcset`, plus `width` and `height`. It keeps the field's crop, or uses `ratio`.
- **Focal point:** it sets `object-position` to the focal point, so a CSS `object-fit: cover` crops around it.
- **Alt text:** `alt` is in the page's language (`Astro.currentLocale`, or `locale`).
- **Loading:** pictures load lazily. `priority` loads the one the page opens on first.
- **Other props:** `widths`, `formats`, and any `<img>` attribute.

### Without the client

The same in a template, with nothing but string joining:

```html
<img
    src="{{ cover.cropUrl }}&w=1024"
    srcset="{{ cover.cropUrl }}&w=480 480w, {{ cover.cropUrl }}&w=1024 1024w, {{ cover.cropUrl }}&w=1600 1600w"
    sizes="100vw"
    alt="{{ cover.alt }}"
/>
```

With `?locale=`, a picture's `alt` and `caption` come in that language, like every other text.

---

## 5. Videos, documents and other files

`resizeUrl` exists for images only. Videos at a host (Mux, Vimeo, Cloudflare Stream, YouTube)
have `providerStatus` (`uploading`, `processing`, `ready`, `error`) and, once ready,
`providerMetadata.streamUrl`, `embedUrl` and `thumbnailUrl`; their `url` is the stream once ready.
Other files are served as uploaded at `url`.

See also: [Public API and Channels](Public%20API%20and%20Channels.md), [Fields](Fields.md)
(`core/asset`, `core/asset-list`), [`@moteurio/client`](../packages/client/README.md).

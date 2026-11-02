# @moteurio/frontend-plugin-qr

QR code blocks from [Moteur](https://moteur.io) on your site. The code is drawn from the block's own text as an inline SVG: no call to the API, no image to load, sharp at any size.

```bash
npm install @moteurio/frontend-plugin-qr
```

## With a block registry

```ts
import { createBlockRegistry } from '@moteurio/client';

const blocks = createBlockRegistry({
    load: type => (type === 'play/qr' ? import('@moteurio/frontend-plugin-qr') : Promise.reject())
});
const html = await blocks.renderBlock(block, 'en');
```

`render(block, locale)` returns HTML: a `<figure class="moteur-qr">` holding the SVG, a link when the code encodes one (http, https, mailto, tel), and the block's caption. Everything it writes is escaped.

## As a tag

```ts
import '@moteurio/frontend-plugin-qr/element';
```

```html
<moteur-qr text="https://moteur.io" caption="Our site" size="200"></moteur-qr>
```

`size` is in pixels (256 by default), `margin` the quiet zone in modules (2).

## Other uses

`qrSvg(text, { size, margin })` returns the SVG alone, and `renderQr(data, locale, options)` the whole figure from a block's data.

MIT

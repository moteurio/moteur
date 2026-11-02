# @moteurio/frontend-plugin-oembed

Embed blocks from [Moteur](https://moteur.io) on your site: a video, a song, a post. The engine asks the provider when your channel sends the block, so the page makes no call of its own.

```bash
npm install @moteurio/frontend-plugin-oembed
```

## What it draws

- A player that is one frame (YouTube, Vimeo, Spotify, SoundCloud, Dailymotion…): the frame is built here, with the video's title for screen readers, loaded lazily, keeping its shape at any width. The provider's HTML is never inserted.
- Anything else (a post on X, a link no provider embeds, a provider that was down): a link card, with its picture when there is one.
- The block's caption under it.

Everything it writes is escaped. To insert the provider's own HTML instead of a card (a post on X with its script), pass `trustProviderHtml: true`, or set `trust-provider-html` on the tag.

## With a block registry

```ts
import { createBlockRegistry } from '@moteurio/client';

const blocks = createBlockRegistry({
    load: type =>
        type === 'play/oembed' ? import('@moteurio/frontend-plugin-oembed') : Promise.reject()
});
const html = await blocks.renderBlock(block, 'en');
```

## As a tag

```ts
import '@moteurio/frontend-plugin-oembed/element';

const el = document.createElement('moteur-oembed');
el.data = block.data;
```

Or in HTML, the block's data as JSON: `<moteur-oembed locale="en" data='{"url":"…","embed":{…}}'></moteur-oembed>`.

MIT

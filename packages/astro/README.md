# @moteurio/astro

An Astro site on Moteur: content is read at build time into Astro collections. Each page template has a view, and each block type a component, all checked by `astro check`.

## Install

```bash
npm install @moteurio/astro @moteurio/client
npm install --save-dev @moteurio/cli   # `moteur types`
```

`@moteurio/client` is a peer dependency: the types `moteur types` writes, and helpers like `richTextHtml`, come from it, so the site and this package share one copy.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { moteur } from '@moteurio/astro/integration';

export default defineConfig({ integrations: [moteur()] });
```

The integration lets the build write Moteur's pictures into the site (see [Pictures](#pictures-moteurimage)). It reads `MOTEUR_API_URL` like the client, or takes `moteur({ apiUrl })`.

## Connect

```bash
# .env
MOTEUR_API_KEY=mk_live_…   # read-only: Studio › Setup › API channels › Make a key for it
```

`createMoteur()` reads `MOTEUR_API_KEY`, from the environment or the site's `.env` files. Set `MOTEUR_API_URL` only for a server of your own; the default is `https://api.moteur.io`. A missing or wrong key stops the build with one message.

## Types

```bash
MOTEUR_API_KEY=… moteur types --channel site --out src/moteur.ts
```

This writes a type for every model, template, block and structure the channel delivers. The site's read-only key is enough. In CI, add `--check`.

## Content: `moteurPages`, `moteurEntries`

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { createMoteur } from '@moteurio/astro';
import { moteurPages, moteurEntries } from '@moteurio/astro/loaders';
import type { MoteurSchema } from './moteur';

// MOTEUR_API_KEY (in .env) is all it needs: the key says its project and channel.
const site = createMoteur<MoteurSchema>().channel();

export const collections = {
    pages: defineCollection({ loader: moteurPages(site) }),
    rivals: defineCollection({ loader: moteurEntries(site, 'rival') })
};
```

- **Pages:** each page is loaded once per language it is in, with its address as the id: `getEntry('pages', '/fr/tarifs')`. A page not translated into French has no French copy, and no French address in `paths`.
    - Each page has `path`, `paths` (one per language it is in, for `hreflang`), `locale`, and its fields in that language.
    - `fallbacks` lists the fields that had nothing in that language and show the default's, so a page can mark them.
    - Links to other pages are already addresses, and pictures already have their files.
- **Entries:**
    - The id is the entry's own (`sanity`) when one language is loaded, or language first (`fr/sanity`) when several are.
    - Each entry has `locale`, and `resolvedUrl` when a collection page gives it an address.
- **Options:**
    - `locales`: which languages to load (default: all the project's).
    - `types`: where `moteur types` wrote the file (default `src/moteur`; `false` for loose types).
    - `resolveAssets`: give pictures their files (default `true`).
- **Typing:** data is typed by your generated types (`AnyPage<'one'>`, `Models<'one'>['rival']`), not by a schema you write.
- **Errors:** a wrong key or an unreachable API stops the build with one clear message.

## Routes and views: `defineTemplates`

One route makes every page, and each page is drawn by its template's view:

```astro
---
// src/pages/[...path].astro
import { getCollection } from 'astro:content';
import { views } from '../views';

export async function getStaticPaths() {
  return (await getCollection('pages'))
    .filter(({ data: page }) => views.for(page))
    .map(({ data: page }) => ({ params: { path: page.path.slice(1) || undefined }, props: { page } }));
}
const { page } = Astro.props;
const View = views.for(page)!;
---
<View page={page} />
```

```ts
// src/views/index.ts
import { defineTemplates } from '@moteurio/astro';
import type { MoteurSchema } from '../moteur';
import Home from './Home.astro';
import Page from './Page.astro';

export const views = defineTemplates<MoteurSchema>({ home: Home, page: Page });
```

```astro
---
// src/views/Page.astro
import type { ViewProps } from '@moteurio/astro';
import type { MoteurSchema } from '../moteur';
type Props = ViewProps<MoteurSchema, 'page'>;
const { page } = Astro.props; // fields typed by the template, plus path, paths and locale
---
<h1>{page.fields.title}</h1>
```

`astro check` fails on:

- a template without a view;
- a view given to the wrong template;
- a field the template doesn't have;
- a name that isn't a template.

At build, the pages of a template added in Studio before the site has a view are left out, with one warning.

## Preview: `previewPage`

Writers preview drafts on a static site through one on-demand route, drawn by the same views:

```astro
---
// src/pages/preview/[...path].astro
export const prerender = false;
import { previewPage } from '@moteurio/astro';
import type { MoteurSchema } from '../../moteur';
import { views } from '../../views';

const page = await previewPage<MoteurSchema>(Astro);
if (!page) return new Response('This preview link has expired.', { status: 404 });
const View = views.for(page)!;
---
<View page={page} />
```

- **In Studio:** set the project's preview address to `https://your-site/preview` (Setup › Project). **Preview** on a page or an entry then opens `/preview/<its address>?preview=<token>`.
- **What it renders:** `previewPage` reads the page at that address with the token, drafts included, shaped as the loader shapes it.
- **When it gives null:** without a token, with an expired one, or at an address no page has.
- **Headers:** the answer is never cached (`private, no-store`), never indexed (`noindex`), and never sends its address, token included, to the page's fonts, scripts or links (`Referrer-Policy: no-referrer`).
- **Hosting:** the route renders on request, so the site needs its host's adapter (`@astrojs/netlify`, `@astrojs/vercel`, `@astrojs/node`…). Every other page stays static.
- **The folder is `preview`, not `_preview`:** Astro makes no routes from folders starting with `_`.
- **Options:** `client` (default: `createMoteur()`), `base` (default `/preview`), `resolveAssets`.

## Blocks: `defineBlocks`

```ts
// src/blocks/index.ts
import { defineBlocks } from '@moteurio/astro';
import type { MoteurSchema } from '../moteur';
import Hero from './Hero.astro';
import Quote from './Quote.astro';

export const components = defineBlocks<MoteurSchema>({
    hero: Hero, // the project's own blocks are named without a namespace
    'core/quote': Quote // core and plugin blocks keep theirs
    // …one for every block type
});
```

```astro
---
import Blocks from '@moteurio/astro/Blocks.astro';
import { components } from '../blocks';
---
<Blocks blocks={page.fields.blocks} components={components} />
```

Each component gets `data` (the block's fields, typed) and `block`:

```astro
---
// src/blocks/Hero.astro
import type { HeroBlockData } from '../moteur';
interface Props { data: HeroBlockData<'one'> }
const { data } = Astro.props;
---
<h1>{data.title}</h1>
```

`astro check` fails on:

- a block type without a component;
- a component whose `data` doesn't fit its block;
- a name that isn't a block type.

### What the page shares with every block

Blocks often need something from the page: its address, the site's words in its language. Give it once, as `shared`, and type it as `defineBlocks`'s second parameter:

```ts
// src/blocks/index.ts
export type Shared = { path: string; words: SiteSettingsEntry<'one'>['blocks'] };
export const components = defineBlocks<MoteurSchema, Shared>({ hero: Hero /* … */ });
```

```astro
<Blocks blocks={page.fields.blocks} components={components} shared={{ path: page.path, words }} />
```

```astro
---
// src/blocks/Hero.astro: takes the part it needs
interface Props { data: HeroBlockData<'one'>; path: string }
---
```

A component may take any part of `Shared`. One that asks for something the page doesn't share fails `astro check`. Nothing in `shared` replaces `data` or `block`.

At runtime, a block type added in Studio before the site has a component for it is skipped, with a warning in dev.

## Pictures: `<MoteurImage>`

```astro
---
import MoteurImage from '@moteurio/astro/MoteurImage.astro';
---
<MoteurImage image={page.fields.cover} sizes="(min-width: 60rem) 50vw, 100vw" priority />
<MoteurImage image={author.data.portrait} ratio="1:1" sizes="8rem" />
```

- **Sizes:** a `<picture>` with AVIF and WebP, each with a `srcset` of the widths Moteur makes (never wider than the original).
- **Shape:** `width` and `height` are set, so the page doesn't jump while the picture loads.
- **Crop:** the field's own crop, or `ratio`, centered on the picture's focal point.
- **Focal point:** it is also the `object-position`, so a CSS `object-fit: cover` keeps it in view.
- **Alt text:** `alt` is the field's text, else the picture's own, in the page's language. Override it with `alt`.
- **Loading:** pictures load lazily. Give the one the page opens on `priority`.
- **Where the files come from (`from`):**
    - `site`, the default on pages built ahead: the build downloads each picture once (the original, or Moteur's crop of it) and Astro writes every size into the site. Visitors never reach Moteur. Needs the [`moteur()` integration](#install); without it the pictures come from Moteur, and the build says so.
    - `moteur`, the default on pages rendered on request (`/preview`): every size is Moteur's, made on its first request and then cached for good (`immutable`).
    - **Cost:** building them takes time once. 21 pictures took about 17 s on a cold build, and 0.7 s once Astro's cache (`node_modules/.astro`) is kept, as Netlify and Vercel keep it between builds. Without the cache, every build pays the cold price.
    - **Gain:** visitors load files from the site's host, and no first visitor waits for Moteur to make a size.
- **Options:**
    - `widths`: the widths to offer.
    - `formats`: best first; the default is `['avif', 'webp']`.
    - `locale`: the language of the alt text, when the site doesn't use Astro's i18n.
    - Any other `<img>` attribute (`class`, `style`, …) is passed through.

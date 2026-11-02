# Reading content, and a site on Moteur

## Channels and keys

A site reads a **channel**: a new project has `site` (its published pages, every model, menus, forms and layouts), unless it came from a Git remote with channels of its own. A read-only API key opens it:

```bash
moteur keys create --label "Site build" --channels site --site-wide   # the secret is shown once
```

Routes, under `/projects/:projectId/channels/:channelId` (header `x-api-key`):

| Route                                          | Gives                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `/pages`, `/pages/:id`, `/pages/by-slug/:slug` | Pages, with `path` and `paths` (their address in each language they are in). |
| `/:modelId/entries`, `/:modelId/entries/:id`   | Entries, as published.                                                       |
| `/settings/:modelId`                           | A settings model's one entry.                                                |
| `/menus`, `/menus/:handle`                     | Menus, their addresses filled in.                                            |
| `/schema`, `/types`                            | What the channel delivers, and its TypeScript types.                         |

Site-wide routes: `/projects/:projectId/urls`, `/sitemap.xml`, `/resolve?path=/fr/tarifs` (what lives at an address, or a redirect).

## What comes back

- **Links to pages** come with their address: a link field gets `url`, page relations become `{ id, label, url }`, and links in rich text and Markdown get their address. A page that is gone or not live: a link field has `missing: true` and no `url`, a page relation leaves it out (a single one is `null`), and a link in text keeps only its words.
- **Pictures** (`core/asset`) come as `{ assetId, alt, caption }`. Add `?resolveAssets=1` for their files and sizes.
- **Relations** to entries come as the entry's id, unless the channel's resource for that model says `resolve: 1` (or `2`): then the related entries come inlined, that many levels.
- **Drafts never** come through a key. A preview link shows them to a person.

## Languages

- `?locale=fr` brings every value down to French, at any depth, falling back to the default language where French is empty.
- Each item then says `locale` (the language it came in), and `fallbacks` when some fields had nothing in that language and show the default's: `"fallbacks": ["body", "blocks[2].data.title"]`. No `fallbacks`: nothing fell back.
- A page or entry that isn't in French (`"languages": ["en"]`) comes in the default language, with `"locale": "en"`, and has no French address: none in `paths`, the sitemap or `hreflang`. Links to it from French pages lead to its default address.
- Without `?locale`, values come as stored: one per language.

## Types

```bash
MOTEUR_API_KEY=… moteur types --channel site --out src/moteur.ts
```

A type for every model, template, block and structure the channel delivers, in two modes: `'all'` (values per language) and `'one'` (read with `?locale=`). `--check` in CI fails when the file is out of date.

## In TypeScript: @moteurio/client

```ts
import { createMoteurPublicClient } from '@moteurio/client';
import type { MoteurSchema } from './moteur';

const moteur = createMoteurPublicClient<MoteurSchema>({ apiKey: process.env.MOTEUR_API_KEY! });
const site = moteur.locale('fr').channel('site');
const pages = await site.pages.list();
const post = await site.entries.get('post', 'hello');
const settings = await site.settings('settings');
```

The key says its project and channel. `baseURL` points at a server of your own (default `https://api.moteur.io`).

## Astro: @moteurio/astro

- `moteur()` in `astro.config.mjs`. It writes Moteur's pictures into the site at build.
- Loaders in `src/content.config.ts`:
    - `moteurPages(site)`: each page once per language it is in, by address (`/fr/tarifs`).
    - `moteurEntries(site, 'post')`: a model's entries per language.
- `defineTemplates<MoteurSchema>({ page: PageView })`: one view per template. One route, `src/pages/[...path].astro`, draws every page.
- `defineBlocks<MoteurSchema, Shared>({ hero: Hero })`: one component per block type. `<Blocks blocks={…} shared={…} />` draws them, giving each component its data, the block, and what the page shares (its path, language, settings).
- `<MoteurImage image={…} sizes="…" />` for pictures.
- `astro check` then fails on a template without a view, a block without a component, or a field the schema doesn't have.

Full guide: https://github.com/moteurio/moteur/blob/main/packages/astro/README.md

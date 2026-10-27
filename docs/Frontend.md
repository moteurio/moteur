# Frontend delivery

Moteur separates **authoring** (Studio + JWT) from **delivery** (your site + project API key). This guide covers brownfield integration and the shared helpers.

## Mental model

1. Configure a **collection** (channel) in Studio with the models, fields, and statuses you want public.
2. Create a **read-only API key** for that collection.
3. In your app, fetch with `createMoteurPublicClient` and render **one template per block type**.
4. For **draft preview**, mint a **preview token** (JWT, server-side) and pass it as `x-preview-token` or `?preview=` alongside the API key.

Never put member JWTs in browser bundles. See [Pages and navigation](Pages%20and%20navigation.md).

## Packages

| Package             | Repo                                                           | Use                                                                      |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@moteurio/client`  | [moteur](https://github.com/moteurio/moteur)                   | Public + admin HTTP client; `t`, block registry, preview session helpers |
| `@moteurio/react`   | [moteur-frontend](https://github.com/moteurio/moteur-frontend) | `MoteurProvider`, `Blocks`, `usePreview`                                 |
| `@moteurio/vue`     | moteur-frontend                                                | `createMoteurPlugin`, `MoteurBlocks.vue`, composables                    |
| `@moteurio/astro`   | moteur-frontend                                                | `createMoteur()`, `Blocks.astro`                                         |
| `@moteurio/vanilla` | moteur-frontend                                                | ESM helpers + block registry                                             |
| `moteurio/php`      | [moteur-starters](https://github.com/moteurio/moteur-starters) | Guzzle client, preview middleware (Composer)                             |

Framework adapters are **not** host plugins — they are npm packages for your site. Optional `@moteurio/frontend-plugin-*` companions ship with **moteur-plugins-extra** for specific block types.

Plugin **frontend companions** (`@moteurio/frontend-plugin-*`) ship web components for optional block types (oEmbed, QR, poll). Install only the plugins your site uses.

## Types

`moteur types --out src/moteur.ts` writes TypeScript types for the project's content: an entry type per model (`ArticleEntry`), a page type per template (`HomePage`), and a type per block (`HeroBlock`, with `AnyBlock` for all of them) and per structure (`CtaStructure`). Lists, objects, variants, links and page relations are typed all the way down. Project blocks and structures drop their namespace (`moteur-io/hero` is `HeroBlock`).

Each type takes a locale mode. `'all'` (the default) is content as stored, a value per language. `'one'` is content read with `?locale=`:

```ts
import type { HomePage, AnyPage } from './moteur';

const page: HomePage<'one'> = await fetch(`${api}/pages/home?locale=fr`, { headers }).then(r =>
    r.json()
);
page.fields.seo?.title; // string

function render(page: AnyPage<'one'>) {
    if (page.templateId === 'home') return page.fields.blocks; // narrowed to the home template
}
```

The file also has `MoteurSchema`, for the client: `createMoteurPublicClient<MoteurSchema>(…)` (or `createMoteur<MoteurSchema>` in `@moteurio/astro`) types every answer, and `.locale('fr')` gives a client whose reads come in that language, typed `'one'`. See the [client README](../packages/client/README.md#typed-answers-in-one-language).

The types come from the channel's schema, so the site's read-only key is enough: `moteur types --channel site --out src/moteur.ts`. They then describe only what that channel delivers. Without `--channel`, they come from every schema of the project (`GET /projects/:projectId/types`, for a signed-in member). In CI, `--check` fails when the file no longer matches:

```bash
MOTEUR_API_KEY=… moteur types --channel site --out src/moteur.ts --check
```

## The schema of a channel

`GET /projects/:projectId/collections/:collectionId/schema` describes what a channel delivers: its models (only the fields it gives), the templates of its pages, and the blocks and structures they use. For each field: its type, label and description (per language), and the options that explain its value (`required`, `multilingual`, `choices` with their labels, a relation's `model`, a block list's `allowedBlockTypes`, limits). Studio's presentation options and plugins' settings are left out. It is the same shape as the stored schemas, so it reads like them.

```ts
const schema = await moteur.channel('site').schema();
schema.models.rival.fields.pricing; // { type: 'core/select', label: { en: 'Pricing model' }, options: { choices: […] } }
```

`version` changes whenever a schema does, and is the `ETag`: send `If-None-Match` and an unchanged schema answers 304. `GET …/collections/:collectionId/types` is the same schema as TypeScript.

## Preview tokens

```ts
// Server route or Studio (member JWT)
const { rawToken } = await admin.forProject('my-site').previewTokens.create({
    entryId: '…',
    collectionId: 'website',
    ttlSeconds: 1800
});

// Public client (API key + preview)
const client = createMoteurPublicClient({
    baseURL: process.env.MOTEUR_API_URL!,
    auth: { type: 'apiKey', apiKey: process.env.MOTEUR_API_KEY!, projectId: 'my-site' }
}).withPreview(rawToken);
```

Collection reads then use the **latest** entry view (drafts included per collection status filters).

A token made for one entry (`entryId`) or one page (`pageId`) shows only that one as it is now: in lists, and read by id or slug. Everything else comes back as published, so a preview link can't be used to read the project's other drafts. A token with neither shows every draft, for previewing the whole site. Draft pages never appear in navigation or menus.

## Starters

Official stacks live in [moteur-starters](https://github.com/moteurio/moteur-starters). See [Starters.md](Starters.md). Use `create-moteur-app` for a new project with a wired frontend scaffold.

## Plugin blocks on the site

Declare `contributes.frontend` on API plugins. Pair with `@moteurio/frontend-plugin-<id>` in your bundle:

```html
<script type="module">
    import '@moteurio/frontend-plugin-oembed';
</script>
<moteur-oembed url="https://…" api-base="https://api.example.com" project-id="demo"></moteur-oembed>
```

Core blocks (`core/paragraph`, etc.) remain your own components.

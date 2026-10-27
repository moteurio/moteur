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

The types come from `GET /projects/:projectId/types`. Make them again after a schema changes, in CI for example.

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

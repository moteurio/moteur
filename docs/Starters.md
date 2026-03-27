# Starters

Moteur ships with official starters for every major web stack.
Each starter renders the same demo project — **Moteur Journal**, the editorial
magazine of a fictional 1968 Montréal robotics company — so you can compare
them side by side with identical content and design. For API docs, core concepts, and the rest of the ecosystem, see the [documentation index](README.md).

Every starter shares the same content architecture:

- Bilingual FR/EN routing (`/fr/` and `/en/` URL trees)
- Typed content blocks — one template per block type, driven by the API
- The same block rendering pattern across every stack

Pick the stack you know. The Moteur patterns are identical across all of them.
All official starters live in the `moteur-starters` monorepo under `packages/<starter>`.

---

## `moteur-starter-next`

**Next.js · React · App Router**

The default starter. If you're a React developer or you're not sure which
starter to use, start here. Uses the App Router with React Server Components
throughout — content is fetched on the server, zero client JS shipped by default.

Pages are statically generated at build time. Draft Mode demonstrates the
intentional CSR escape hatch — when an editor previews unpublished content
from Moteur Studio, the page fetches fresh data client-side, bypassing the
static cache entirely. The same pattern applies to anything that needs live
data alongside static content. `next/image` handles all image optimisation
automatically.

```bash
git clone https://github.com/moteurio/moteur-starters
cd moteur-starters/packages/next
```

**Best for:** React developers, teams already on Vercel, projects that need
a familiar ecosystem and strong TypeScript support.

**Rendering:** SSG at build time with ISR — pages revalidate automatically
when you publish in Moteur Studio via webhook.

**Unique feature:** Draft Mode — editors preview unpublished content in context
directly from Moteur Studio. The static page is the default; Draft Mode is the
deliberate escape hatch to client-side rendering when freshness matters.

---

## `moteur-starter-astro`

**Astro · .astro components · Islands architecture**

The content-first starter. Astro's philosophy matches Moteur's — structured
content drives everything, JavaScript is opt-in. Pages are fully static HTML
by default. Only the parts that need interactivity ship any JS at all.

The lang switcher is a native web component (`<lang-toggle>`), demonstrating
that you don't always need a framework for interactive UI. Full-text search
is powered by Pagefind — the search index is built at compile time, the search
UI hydrates as an island on `client:idle`.

```bash
git clone https://github.com/moteurio/moteur-starters
cd moteur-starters/packages/astro
```

**Best for:** Developers who prioritise performance, content-heavy sites,
teams who want to avoid shipping a JS framework to the browser.

**Rendering:** Static site generation — full static output, deploy anywhere.

**Unique feature:** Pagefind search island — instant full-text search across
all articles, built at compile time, zero server required.

---

## `moteur-starter-eleventy`

**Eleventy · Nunjucks · Pure SSG**

The explicit starter. Eleventy has no opinion on how you fetch data, structure
your templates, or handle i18n — every decision is visible in the code.
If you want to understand exactly how a Moteur-powered site works from first
principles, this is the one to read.

The data pipeline is a set of plain async JavaScript files in `_data/` —
each one fetches a Moteur collection at build time and returns JSON.
Templates are Nunjucks. The block loop is a single line. Nothing is hidden.

```bash
git clone https://github.com/moteurio/moteur-starters
cd moteur-starters/packages/eleventy
```

**Best for:** Developers who want full control, static sites with no runtime
dependency, documentation sites, government and accessibility-focused projects.

**Rendering:** Pure static site generation — HTML files, no server needed.

**Unique feature:** The most readable codebase in the set. Every architectural
decision is explicit and documented. Good for learning how Moteur works.

---

## `moteur-starter-slim`

**Slim 4 · Twig 3 · Runtime PHP**

The PHP starter. The only starter in the set that runs at request time on a
PHP server — which means it can do things static sites cannot. API responses
are cached in APCu (with a file cache fallback) and invalidated automatically
when you publish in Moteur Studio via webhook.

Routing is explicit — `routes.php` is a readable map of every URL the site
can produce. A catch-all alternative is fully implemented and documented in
the same file for projects that outgrow explicit routes.

Twig templates use the `attribute()` function to handle bilingual field names
dynamically — `attribute(article, 'title_' ~ locale)` — a single pattern that
works for every localised field without any PHP logic in templates.

```bash
git clone https://github.com/moteurio/moteur-starters
cd moteur-starters/packages/slim
```

**Best for:** PHP developers, digital agencies, teams deploying to traditional
shared hosting or VPS, projects that need server-side logic alongside content.

**Rendering:** Runtime PHP — server renders each request, with APCu caching
and webhook-based cache invalidation.

**Unique feature:** Draft preview via token — share a preview link before
publishing. One middleware, one route, works without touching the main codebase.

---

## `moteur-starter-cloudflare`

**Cloudflare Workers · Hono · Edge rendering**

The modern infrastructure starter. Runs at the edge — globally distributed,
zero cold starts, no server to manage. Uses Hono as a lightweight router
on top of Workers. Templates are plain TypeScript HTML template literals —
no template engine, no build step for views, just strings.

API responses are cached in Cloudflare KV — reads are edge-local, meaning
your content is served from the datacenter closest to each visitor.
Cache is invalidated via Moteur webhook on publish, same as the Slim starter.

```bash
git clone https://github.com/moteurio/moteur-starters
cd moteur-starters/packages/cloudflare
```

**Best for:** Teams already on Cloudflare, projects that need global
distribution without managing infrastructure, developers who want to
explore edge rendering with a real content use case.

**Rendering:** Edge SSR — every request is rendered at the nearest Cloudflare
datacenter, with KV caching for API responses.

**Unique feature:** The fastest time-to-first-byte in the set. Content is
rendered at the edge and API responses are cached globally in KV — no origin
roundtrip for cached pages.

---

## `moteur-starter-nuxt`

**Nuxt 3 · Vue · SSR + SSG**

The Vue starter. Nuxt's universal rendering makes it straightforward to mix
static and dynamic pages — issue index and article pages are statically
generated, while anything that needs freshness can render on the server.
Uses Nuxt's built-in `useFetch` composable with a Moteur plugin that handles
authentication and response normalisation.

```bash
git clone https://github.com/moteurio/moteur-starters
cd moteur-starters/packages/nuxt
```

**Best for:** Vue developers, European digital agencies (strong Vue ecosystem),
teams who want a batteries-included framework with good DX.

**Rendering:** Universal — static generation by default, SSR available
per-route via `routeRules`.

**Unique feature:** Nuxt Content integration layer — Moteur blocks are mapped
to Nuxt Content's prose components, making it easy to mix Moteur-managed
content with local Markdown files.

---

## Comparison

|                        | Next.js                       | Astro                         | Eleventy                               | Slim                                   | Cloudflare                | Nuxt                               |
| ---------------------- | ----------------------------- | ----------------------------- | -------------------------------------- | -------------------------------------- | ------------------------- | ---------------------------------- |
| **Language**           | TypeScript                    | TypeScript                    | JavaScript                             | PHP                                    | TypeScript                | TypeScript                         |
| **Templates**          | React / RSC                   | `.astro`                      | Nunjucks                               | Twig 3                                 | Template literals         | Vue SFCs                           |
| **Rendering**          | SSG + ISR                     | SSG                           | SSG                                    | Runtime PHP                            | Edge SSR                  | SSG + SSR                          |
| **Runtime**            | Node / Vercel                 | None                          | None                                   | PHP 8.1+                               | CF Workers                | Node                               |
| **Deploy**             | Vercel / Node                 | Anywhere static               | Anywhere static                        | PHP host                               | Cloudflare                | Node host                          |
| **Client JS**          | Minimal                       | Zero by default               | Zero                                   | Zero                                   | Zero                      | Minimal                            |
| **Cache**              | ISR                           | Static files                  | Static files                           | APCu + file                            | KV (global)               | Static / CDN                       |
| **Cache invalidation** | Webhook → revalidate          | Rebuild                       | Rebuild                                | Webhook → APCu flush                   | Webhook → KV flush        | Rebuild                            |
| **i18n**               | `/fr` `/en` route groups      | `/fr` `/en` static paths      | Two pagination passes                  | Route group prefix                     | Route prefix              | Nuxt i18n module                   |
| **Block loop**         | `<Block type={block.type} />` | `<Block type={block.type} />` | `{% include "blocks/block-" + type %}` | `{% include 'blocks/block-' ~ type %}` | `renderers[block.type]()` | `<component :is="blocks[type]" />` |
| **Unique feature**     | Draft Mode                    | Pagefind search               | Most readable code                     | Draft preview token                    | Fastest TTFB              | Nuxt Content bridge                |
| **Best for**           | React teams                   | Perf-focused                  | Full control                           | PHP / agencies                         | CF infrastructure         | Vue teams                          |

---

## What every starter has in common

Regardless of stack, every starter shares these patterns:

**One template per block type.**
The article body is a typed array of blocks from the Moteur API.
Each block type maps to exactly one template file. Adding a new block type
means creating one file — nothing else changes.

**Locale resolved at the routing layer.**
Every template receives a `locale` variable (`"fr"` or `"en"`).
Templates access the correct localised field without any conditional logic
inside the block components themselves.

**Lang switcher is just a link.**
The sibling URL for each locale is computed at build or request time from
the content's localised slug fields. The language switcher is an `<a>` tag.
No JS required.

**Same CSS, same animations.**
All starters share the same stylesheet and the same `scroll.js` (Lenis + GSAP).
The Moteur Journal design is identical across every stack.
What changes is only the template layer and the data pipeline.

---

## Not sure which to pick?

**I'm a React developer** → `moteur-starter-next`

**I want the fastest possible static site** → `moteur-starter-astro`

**I want to understand how Moteur works** → `moteur-starter-eleventy`

**I'm building on a PHP server / for an agency client** → `moteur-starter-slim`

**I'm deploying on Cloudflare** → `moteur-starter-cloudflare`

**I'm a Vue developer** → `moteur-starter-nuxt`

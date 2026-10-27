# @moteurio/client

TypeScript/JavaScript client for the [Moteur](https://github.com/moteurio/moteur) HTTP API.

Moteur exposes **two security models**. This package mirrors them with **two factories** so you pick the right one and get a type surface that matches what the server will actually allow:

| You are building…                                                                     | Factory                    | Auth                                                  |
| ------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------- |
| **Tools, scripts, CMS integrations, anything that edits content or manages projects** | `createMoteurAdminClient`  | JWT (`Authorization: Bearer …`)                       |
| **A public site, static generator, or BFF that only reads published-shaped data**     | `createMoteurPublicClient` | Project **API key** (`x-api-key`) + fixed `projectId` |

## Installation

```bash
npm install @moteurio/client
# or pnpm add / yarn add
```

---

## Why two clients?

The server **does not** treat “any request + API key” like “any request + JWT”.

- **JWT** means an identified user with **project access** (and possibly operator rights). That unlocks **writes**, **draft content**, direct **model/entry** APIs, project settings, **creating** channels and API keys, assets, webhooks, etc.
- **Project API key** is **read-only** (GET only). It is allowed only on routes designed for public consumption: **channel metadata**, **reads through a channel (the channel)**, **page outputs** (sitemap, navigation tree, urls, breadcrumb). Radar reads drafts, so it takes a member's sign-in (`projects.radar` on the admin client).  
  What you can read **depends on how the channel is configured** (which models, fields, statuses, reference depth).

So: **one generic client with an API key would lie**—many methods would always return 401/403. Splitting factories matches reality and keeps frontend code honest.

---

## For tool builders: `createMoteurAdminClient` (JWT)

Use this for **CLIs**, **internal dashboards**, **automation**, **Moteur Studio–style apps**, or any integration where the user signs in or you hold a long-lived token.

### What you can do (that the public client cannot)

- Create/update/delete **projects**, **models**, **entries** (all statuses, workflow actions), **pages**, **templates**, **assets**, etc.
- Manage **channel definitions** (what a future public “channel” will expose) via `channels` on the admin client.
- **Create, rotate, or revoke** project API keys (`forProject(...).apiKeys.create()`, `.rotate(keyId)`, …) after you are logged in.
- Use **branches**, **comments**, **reviews**, **webhooks**, **submissions**, and other **project-scoped** HTTP resources.
- Call **`client.instance`** for **deployment-wide maintenance** (usage counters, blueprint seeding, asset migration)—separate from editing a single project’s content; usually requires an **operator**-capable user (see below).
- Read **per-project activity** (audit log) with `forProject(...).activity` or `projects.activity.list(projectId, …)`.

### Getting a token

1. **Login** (then store `token` securely, e.g. env var or secret store):

```ts
import { createMoteurAdminClient } from '@moteurio/client';

const baseURL = process.env.MOTEUR_API_URL!; // e.g. https://api.moteur.io

// Often you create an unauthenticated client only for login:
const loginClient = createMoteurAdminClient({ baseURL });
const { token, user } = await loginClient.auth.login('user@example.com', 'password');
```

The HTTP body uses `username` and `password` fields; use the account email (or username) your server expects—see [Authentication](https://github.com/moteurio/moteur/blob/main/docs/Authentication.md) for the exact login contract. 2. **Use the token** on a second client (or `setAuth` if you reuse the same instance—see advanced note below):

```ts
const client = createMoteurAdminClient({
    baseURL,
    auth: { type: 'bearer', token }
});

const { user } = await client.auth.me();
const { projects } = await client.projects.list();
```

3. **Refresh** before expiry:

```ts
const { token: newToken } = await client.auth.refresh();
```

### Pattern A — `forProject(projectId)` (recommended)

Fix the project once; every call under that object omits `projectId`:

```ts
const p = client.forProject('my-blog');

// Content
const { models } = await p.models.list();
const { entries } = await p.entries.list('posts', { limit: 20, status: 'published' });
await p.entries.create('posts', { title: 'Draft', slug: 'draft' });

const { pages } = await p.pages.list();
const { page } = await p.pages.getBySlug('about');

// Channel definitions (shape of a future public channel—not the same as public channel reads)
const { channels } = await p.channels.list();
await p.channels.create({
    label: 'Website',
    resources: [
        { resourceType: 'model', resourceId: 'posts', filters: { status: ['published'] } },
        { resourceType: 'page', resourceId: 'pages' }
    ]
});

// Issue a key for a static site / BFF (raw key only returned once—persist it!)
const { rawKey } = await p.apiKeys.create();
```

### Pattern B — root client (explicit `projectId`)

Use when you hop between projects or write generic tooling:

```ts
await client.models.list('my-blog');
await client.entries.list('my-blog', 'posts', { limit: 10 });
await client.pages.list('my-blog');
await client.projects.get('my-blog');
```

### `client.instance` (deployment maintenance, operator-oriented)

The SDK does not model **Moteur Studio** (or any other product) as a concept—`instance` is simply the **deployment-level** slice of the HTTP API: operations that affect the whole installation or storage layer, not one project’s pages or entries. Those routes are **operator-oriented**; many JWTs will get **403**.

Exact URL paths are defined by the server’s OpenAPI spec (this client only forwards requests).

| SDK call                                          | What it does                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`instance.usage()`**                            | **Request volume counters** for the deployment: one bucket for **authenticated back-office** traffic and one for **public** (e.g. API-key) traffic, with **per-project** totals where applicable. For **quota / ops visibility**, not product analytics. JSON field names match the API response (see OpenAPI). |
| **`instance.seed.run({ force })`**                | Copies **starter blueprint files** from the server’s seed directory into the live **blueprints** store so a new install has templates to work with. **`force: true`** overwrites existing blueprint files.                                                                                                      |
| **`instance.migrateProvider({ toProvider, … })`** | **Migrates stored assets** between storage providers (e.g. local disk → S3/R2). Optional **`projectIds`** limits scope; see OpenAPI / server docs for the full body.                                                                                                                                            |

```ts
const usage = await client.instance.usage();
await client.instance.seed.run({ force: false });
await client.instance.migrateProvider({ toProvider: 's3' });
```

### Project activity (audit log)

**Normal use** is the **per-project** log (who changed what inside this project):

```ts
const p = client.forProject('my-blog');
const log = await p.activity.list({ limit: 50 });

// or with explicit project id:
await client.projects.activity.list('my-blog', { limit: 50, before: cursor });
```

**`client.activity.list()`** → `GET /activity` is a **cross-project / system-wide** activity stream for operators monitoring the whole deployment. Prefer **`forProject().activity`** / **`projects.activity`** for app and CMS tooling.

### Security notes (admin)

- Treat JWTs like passwords: **environment variables**, **secret managers**, never commit to git.
- **Browser apps:** keep tokens on your backend or use your app’s session; do not expose long-lived JWTs in front-end bundles.

---

## Delivery helpers (preview, locale, blocks)

Framework-agnostic utilities exported from the same package:

| Export                                             | Purpose                              |
| -------------------------------------------------- | ------------------------------------ |
| `t(value, locale)`                                 | Localized field strings              |
| `siblingPath(pathname, locale, segments?)`         | Language-switch URLs                 |
| `createBlockRegistry({ load, fallback })`          | Map `block.type` → renderer          |
| `createPreviewSession({ search, cookie })`         | Read `?preview=` / cookie for tokens |
| `createMoteurPublicClient(...).withPreview(token)` | Send `x-preview-token` on reads      |

Mint tokens with a **JWT** (`forProject(id).previewTokens.create({ entryId, channelId })`). See [Frontend.md](https://github.com/moteurio/moteur/blob/main/docs/Frontend.md).

Framework adapters (`@moteurio/react`, `@moteurio/vue`, `@moteurio/astro`, `@moteurio/vanilla`) live in the **[moteur-frontend](https://github.com/moteurio/moteur-frontend)** repo — not in this monorepo and not in moteur-plugins.

---

## For frontend & static sites: `createMoteurPublicClient` (API key)

Use this when you only have the **project API key** and you **read** data for rendering (Next.js, Astro, Nuxt BFF, edge function, cron job, etc.).

### Channels and channels (mental model)

1. A **collection** is a **named bundle of resources** an operator configured in Moteur (which models, which pages, field allowlists, status filters, reference resolution depth).
2. The **API key** is allowed to hit **channel-scoped URLs**—that’s your **channel**: same project, same key, but `channelId` picks **which** slice of content applies.
3. Listing `client.channels.list()` returns those definitions (ids, labels, resources). Reading `client.channel('website').entries.list('posts')` returns **entries as shaped by that channel** (not the raw admin entry API).

So: **channel = channel id + typed helpers** in the SDK; on the wire it is `/projects/:projectId/channels/:channelId/...`.

### What’s on the public client

| Property                 | Purpose                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`channels`**           | `list()` / `get(id)` — metadata about configured channels.                                                                                                       |
| **`channel(channelId)`** | `pages`, `entries`, `layouts`, `forms`, `menus` — **GET** reads allowed by that channel’s config. `schema()`: what it delivers, described.                       |
| **`site`**               | Page **outputs**: `sitemapXml`, `sitemapJson`, `navigation` (published **tree**), `urls`, `breadcrumb` (each takes `locale`), `resolve(path)` and `redirects()`. |

### Typed answers, in one language

`moteur types --channel site --out src/moteur.ts` writes the channel's types, `MoteurSchema` among them (the site's read-only key is enough). Give it to the client and every read is typed: model ids are checked, entries and pages have their fields, blocks are a union you can switch on.

```ts
import { createMoteurPublicClient } from '@moteurio/client';
import type { MoteurSchema } from './moteur';

const moteur = createMoteurPublicClient<MoteurSchema>({ baseURL, auth });

// As stored: a value per language ({ en, fr }).
const post = await moteur.channel('site').entries.get('post', 'hello');

// In one language: every multilingual value is a plain value, and typed as such.
const fr = moteur.locale('fr');
const pages = await fr.channel('site').pages.list();
for (const page of pages) if (page.templateId === 'home') page.fields.seo?.title; // string

await fr.site.urls(); // site outputs follow the client's language too
```

`locale()` sends `?locale=` with every read (a call can ask another: `{ locale: 'en' }`). A call with `locale` answers in one language even on a client without one. Without a schema, answers are typed loosely (`DeliveredEntry`, `DeliveredPage`), never `unknown`.

### Menus vs `site.navigation`

- **`channel(id).menus.get('main')`** → HTTP `GET /projects/:id/channels/:channelId/menus/main` — a menu editors build in Studio (Setup › Menus), with item URLs resolved. The channel must give that menu.
- **`site.navigation()`** → HTTP `GET /projects/:id/navigation` — the tree **computed from the page tree** (`navInclude` pages).
- **Admin** `forProject().navigations` → CRUD on the menu documents themselves (JWT).

### One key is enough

`createMoteurPublicClient({ apiKey })` reads from `https://api.moteur.io` (`baseURL` for a server of your own). On the first read, the client asks the API what the key is (`GET /keys/me`): its project, and its channel. That's the key's only channel, or `site`, which every project starts with.

- **`channel()`** reads that channel.
- **A key that reads several channels:** name one, `channel('blog')`.
- **`client.whoami()`** gives what the key said.
- **Skipping the question:** give `projectId` (and `channel`).

### Example: load blog posts for a page

```ts
import { createMoteurPublicClient } from '@moteurio/client';

// The key is enough: it says its project and channel (asked once, on the first read).
const client = createMoteurPublicClient({ apiKey: process.env.MOTEUR_API_KEY! });

// The key's channel; `channel('blog')` for another one it reads.
const posts = await client.channel().entries.list('posts', {
    resolveUrl: true // adds resolved URL when the API supports it
});

const post = await client.channel('website').entries.get('posts', entryId, {
    resolveAssets: true
});
```

### Images: `srcset`, crops, alt text

Media fields read with `resolveAssets: true` carry the server's image addresses. Helpers turn
them into `<img>` attributes (no network calls):

```ts
import { imageAttributes, imageUrl } from '@moteurio/client';

const { cover } = post.data;
const img = imageAttributes(cover, { sizes: '(min-width: 60rem) 50vw, 100vw', locale: 'fr' });
// { src, srcset, sizes, width, height, alt }, cropped to the field's shape if it has one
const og = imageUrl(cover, 1200, { ratio: '16:9', format: 'jpg' });
```

`imageSrcset`, `focalPosition`, `IMAGE_WIDTHS` and `IMAGE_RATIOS` too. Parameters, crops and
caching: [docs/Images.md](../../docs/Images.md).

### Example: sitemap and nav in a build step

```ts
const xml = await client.site.sitemapXml();
const urls = await client.site.sitemapJson();
const nav = await client.site.navigation({ depth: 3 });
const allUrls = await client.site.urls();
const crumb = await client.site.breadcrumb({ pageId: 'page-id', entryId: 'optional-entry-id' });
```

### Security notes (public)

- **Default:** keep the key on a **server**, **serverless function**, or **edge** that calls Moteur (BFF pattern). The key is read-only, but anyone who steals it can still read everything the channel exposes.
- **Browser / SPA only when constrained:** embedding the key in frontend JavaScript is acceptable **only if** you also use the server’s **allowed hosts** feature: with JWT, `PATCH /projects/:projectId/api-keys/:keyId` (body `allowedHosts`) sets hostname patterns; then `x-api-key` requests must send a matching **`Origin`** or **`Referer`**, and callers without those headers (typical Node/curl) get **403**—use **JWT** for those. Align **`CORS_ORIGINS`** on the API with your site origins. Header checks are not cryptographic; they complement, not replace, keeping the key secret.
- Send the key only in the **`x-api-key`** header (see [Authentication](https://github.com/moteurio/moteur/blob/main/docs/Authentication.md)).

---

## Entries: admin path vs channel path

Same domain objects, **different URLs and rules**:

|                       | Admin (`createMoteurAdminClient`)                                                                               | Public (`createMoteurPublicClient`)                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Entries**           | `entries.list(projectId, modelId)` or `forProject().entries.list(modelId)` → `/projects/.../models/.../entries` | `channel(channelId).entries.list(resourceId)` → `/projects/.../channels/.../.../entries` |
| **Statuses / fields** | Full CRUD; filters you pass in the request                                                                      | Determined by the **collection** (API key often sees **published** only)                 |
| **With API key only** | **Not supported** for direct model entries                                                                      | **Supported** through **channels**                                                       |

---

## Configuration reference

### Admin — `MoteurClientConfig`

| Option    | Description                                                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseURL` | API origin (trailing slashes trimmed). Include path prefix if you use `API_BASE_PATH` (e.g. `https://host/api`).                                                                  |
| `auth`    | Optional. `{ type: 'bearer', token }` for JWT, or `{ type: 'apiKey', apiKey, projectId? }` for rare mixed tooling. For **key-only** reads, prefer **`createMoteurPublicClient`**. |
| `timeout` | Optional. HTTP timeout in **milliseconds** for axios. Defaults to **`DEFAULT_REQUEST_TIMEOUT_MS`** (60s). Use **`0`** for no timeout (axios default).                             |

### Public — `MoteurPublicClientConfig`

| Option    | Description                                                                        |
| --------- | ---------------------------------------------------------------------------------- |
| `baseURL` | Same as admin.                                                                     |
| `auth`    | **Required:** `{ type: 'apiKey', apiKey, projectId }` — all three fields required. |
| `timeout` | Same as admin (`DEFAULT_REQUEST_TIMEOUT_MS`, or `0` for no timeout).               |

---

## Admin API cheat sheet

- **`auth`** — `login`, `me`, `refresh`, `providers`
- **`projects`** — `list`, `get`, `create`, `update`, `delete`, `users`, plus nested `branches`, `radar`, `comments`, **`activity`** (`projects.activity.list` — per-project audit log)
- **`forProject(id)`** — same namespaces with `projectId` fixed, including **`activity`**
- **`instance`** — deployment maintenance: `usage`, `seed`, `migrateProvider` (operator-oriented; see table under admin section)
- **`blueprints`** — global blueprint templates
- **`operator`** — the whole-server view (projects, accounts, plugins, server-wide blocks and structures). Needs an **operator token** (`POST /operator/auth/login`, password and authenticator code), not a user's: create a second client with it
- **`ai`** — writing, translation, image descriptions, generation. **Needs the AI plugin** (Moteur Cloud): a self-hosted API without it has no `/ai` routes and answers 404; check its `/openapi.json` for `/ai/` paths before offering AI
- **`activity`** (on the root client only) — **`client.activity.list()`** for **cross-project** / system-wide logs (operators); prefer **`forProject().activity`** for normal tooling

Types: **`MoteurAdminClient`**, **`MoteurPublicClient`**, **`ProjectClient`**, **`createProjectClient`**

---

## Errors

### `MoteurApiError` (failed HTTP responses)

When the API returns a **non-2xx** status, the client throws **`MoteurApiError`** (extends `Error`):

- **`message`** — prefers the API’s `error` field when present
- **`status`** — HTTP status when available
- **`response`** — the axios response (status, headers, body)
- **`data`** — the JSON body, when there is one
- **`code`** — a machine-readable reason: the body’s `code`, else its `error` when that is snake_case. For example `insufficient_credits` (402, out of AI credits), `plan_limit` (402, over the plan; `data.limit` and `data.max` say which), `rate_limited` (429), `ENTRY_INCOMPLETE`
- **`retryAfter`** — seconds to wait, from a 429’s `Retry-After` header

Import it from `@moteurio/client` and use `err instanceof MoteurApiError` when you need structured handling.

To react to failures in one place (a banner for "out of credits", a toast for "slow down"), pass **`onError`** when creating the client. It sees every `MoteurApiError` before the call rejects; it can’t change or swallow the error.

```ts
const moteur = createMoteurAdminClient({
    baseURL,
    onError: err => {
        if (err.status === 429) showToast(`Try again in ${err.retryAfter ?? 60}s`);
    }
});
```

**Timeouts and network errors** use axios’s usual behavior (they are not always `MoteurApiError`). Configure **`timeout`** on the client to bound how long a call may hang.

### `MoteurClientError` (invalid config / credentials)

**`createMoteurPublicClient`** throws **`MoteurClientError`** when `auth` is missing required fields. **`resolveCredentials()`** throws it for inconsistent environment variables (see below). Instances expose **`code`**, **`message`**, and optional **`hint`**.

---

## Credential resolution (`resolveCredentials`)

For **CLIs and tooling** that read auth from the environment or a local config file, the package exports **`resolveCredentials()`** (used by the official Moteur CLI).

**Precedence:** **`MOTEUR_TOKEN`** requires **`MOTEUR_API_URL`**. Otherwise **`MOTEUR_API_KEY`** (or **`VITE_MOTEUR_API_KEY`**) requires **`MOTEUR_API_URL`** and **`MOTEUR_PROJECT`** (or **`VITE_MOTEUR_PROJECT`**). If neither env path applies, a **config file** under `~/.config/moteur/` (or **`MOTEUR_CONFIG_DIR`**) is used. In Vite/browser builds, **`VITE_MOTEUR_*`** is read when `process.env` is not populated.

Most applications should pass **`auth`** explicitly to **`createMoteurAdminClient`** / **`createMoteurPublicClient`** instead of relying on this helper.

---

## Advanced: `client._raw` (admin client)

**`createMoteurAdminClient`** spreads the internal HTTP kernel, so the returned object includes **`_raw`**: the underlying **axios** instance. This is an **escape hatch** for endpoints or options not yet wrapped by the SDK; treat it as a **weaker semver** surface than the typed methods.

The **public** client does **not** expose `_raw`; it only exposes the curated read-only API.

---

## Real-time presence (WebSocket)

`@moteurio/client` is **HTTP only**. Live collaboration is supplied by the optional private `plugin-presence`; its Socket.IO event contract lives with that plugin in `moteur-plugins-extra`. An engine-only host does not expose `/socket.io`.

The socket comes from the **presence plugin** (Moteur Cloud). A self-hosted API without it has no `/socket.io`, so treat a failed connection as "no live updates" rather than retrying forever. Live activity, comments and reviews arrive on the same socket.

---

## Releasing

See [CONTRIBUTING.md](../../CONTRIBUTING.md#releasing) and the GitHub Actions workflow. From `packages/client`: `pnpm run build` then `npm publish --access public`.

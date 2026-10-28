# Public API & Channels — Quick guide

This guide walks through using the **Public API** with **Channels** and a **project API key** (e.g. for a headless frontend or static site generator).

In TypeScript, use **`createMoteurPublicClient`** from `@moteurio/client` (`channels`, `channel(channelId)`, `site`) — see [packages/client/README.md](../packages/client/README.md).

---

## 1. Get a project API key

Projects can have **multiple** API keys (different secrets, different restrictions). Create them with **JWT** and **project access**. Prefix all paths with `{basePath}` if you use one (e.g. `API_BASE_PATH=/api`).

1. **Log in** to get a JWT:

    ```http
    POST {basePath}/auth/login
    Content-Type: application/json
    { "username": "...", "password": "..." }
    ```

    Response: `{ "token": "...", "user": ... }`.

2. **Create a key** for your project:

    ```http
    POST {basePath}/projects/:projectId/api-keys
    Authorization: Bearer <your-jwt>
    Content-Type: application/json

    { "label": "Production site", "allowedChannelIds": ["<channel-uuid>"], "allowSiteWideReads": false }
    ```

    Omit `allowedChannelIds` for a key that may read **all** channels. Response includes `rawKey` once plus metadata (`id`, `prefix`, …).

3. **Store the `rawKey`** in a safe place (env var, secrets manager). You will **never** see it again; list metadata later with `GET {basePath}/projects/:projectId/api-keys`.

4. **Optional — allowed hosts / scope:** Use `PATCH {basePath}/projects/:projectId/api-keys/:keyId` with `allowedHosts`, `allowedChannelIds`, or `allowSiteWideReads`. Non-empty `allowedHosts` requires matching **`Origin`** or **`Referer`** on each `x-api-key` request (see [Authentication](Authentication.md)).

---

## 2. Create a channel

A new project already has one, `site`: its published pages, every model, menus, forms and layouts. In Studio, **Make a key for it** on a channel creates a key limited to it, which can also read the sitemap and navigation. Create more channels when a project feeds several sites or apps.

### What a key says about itself

```http
GET /keys/me
x-api-key: <your-raw-key>
```

```json
{ "projectId": "my-site", "keyId": "…", "channels": ["site"], "channel": "site", "siteWide": true }
```

`channel` is the one to read when there's no doubt: the key's only channel, or `site`. The client uses this so a site needs nothing but its key.

A channel defines _what_ that API key can read: which models and pages, and with which options (fields, status filter, reference resolution).

With the same JWT (and project access):

```http
POST {basePath}/projects/:projectId/channels
Authorization: Bearer <your-jwt>
Content-Type: application/json

{
  "label": "Blog API",
  "description": "Public blog and pages",
  "resources": [
    {
      "resourceType": "model",
      "resourceId": "blog-post",
      "fields": ["title", "slug", "body", "publishedAt"],
      "filters": { "status": ["published"] },
      "resolve": 1
    },
    {
      "resourceType": "page",
      "resourceId": "pages"
    },
    {
      "resourceType": "menu",
      "resourceId": "main"
    }
  ]
}
```

- **resourceType** is `model`, `page`, `layout`, `form` or `menu`.
- **resourceId** for a model is the model id (e.g. `blog-post`), or `"models"` for every model. For pages use `"pages"` (all) or a template id. For menus use a menu handle (e.g. `main`), or `"menus"` for every menu. Layouts and forms work the same way (`"layouts"`, `"forms"`).
- **fields**: only these keys from `entry.data` are returned; omit for all.
- **resolve**: `0` = no expansion of references; `1` or `2` = inline the entries that relation fields point to, that many levels.

---

## 3. Call the Public API with the key

Send the key **only** in the **`x-api-key`** header (query strings are not supported — they leak via logs and referrers).

```http
GET /projects/:projectId/channels
x-api-key: <your-raw-key>
```

**Example: list channels**

```http
GET /projects/my-blog/channels
x-api-key: mk_live_xxxxxxxx...
```

Response: array of channel objects (id, label, description, resources, …).

**Example: list entries for a model in a channel**

```http
GET /projects/my-blog/channels/:channelId/blog-post/entries
x-api-key: mk_live_xxxxxxxx...
```

Here `blog-post` is the **resourceId** of the model you added to the channel.

**Example: get one entry**

```http
GET /projects/my-blog/channels/:channelId/blog-post/entries/:entryId
x-api-key: mk_live_xxxxxxxx...
```

**Example: list pages**

```http
GET /projects/my-blog/channels/:channelId/pages
x-api-key: mk_live_xxxxxxxx...
```

**Example: get page by slug**

```http
GET /projects/my-blog/channels/:channelId/pages/by-slug/:slug
x-api-key: mk_live_xxxxxxxx...
```

**Example: get a menu**

```http
GET /projects/my-blog/channels/:channelId/menus/main
x-api-key: mk_live_xxxxxxxx...
```

Item URLs come resolved (page paths, asset URLs, custom links). A label is text, or one value per language; `?locale=en` returns that language and falls back to the project default. `GET .../menus` lists every menu the channel gives.

**Example: layouts and forms** (when the channel includes `layout` / `form` resources):

```http
GET /projects/my-blog/channels/:channelId/layouts
GET /projects/my-blog/channels/:channelId/forms/contact
x-api-key: mk_live_xxxxxxxx...
```

**Query params (entries and pages):**

- **`?resolveUrl=1`** on entry list/get — adds computed `resolvedUrl` when a collection page defines a URL pattern for that model.
- **`?resolveAssets=1`** on entry/page reads — inlines each media field's asset (`_resolved`, with `url` and, for images, `resizeUrl`), and `cropUrl` for fields set to crop, at any depth (blocks, lists, structures, variants). Sizes, crops and `srcset`: see [Images](Images.md).
- **`?locale=`** on entry/page reads — every multilingual value comes down to that language, at any depth, falling back to the project's default language. Link labels, the fields of a page relation and the entries a relation inlined come down too.
- **Relations to entries** are inlined up to the channel resource's `resolve` depth, wherever they sit and whether they are stored as a plain id (as Studio keeps them) or as `{ id }`. Entries the reader can't see keep their id, and so do entries of a model the channel doesn't give: an inlined entry comes with that model's field allowlist applied. A relation field set to one model only points there. Editorial blocks (notes for the editors) are left out of everything a channel sends, wherever they sit.
- **Links to pages and page relations** are always filled in, on entries and pages, at any depth (blocks, lists, structures, variants): a `core/link` with a `pageId` gets the page's `url`, and a relation with `target: "pages"` becomes `{ id, label, url, fields }`. With **`?locale=`** each address is the one in that language; without, one per language. A page the reader can't see (gone, a folder, a draft outside preview, or outside the channel's page filter) leaves the link with `missing: true` and drops it from relations. See [Fields](Fields.md#core-link).
- Entry lists also support **`limit`**, **`offset`**, and **`sort`** (`id`, `createdAt`, `updatedAt`, `publishedAt`, prefix `-` for descending).

---

## 4. Important points

- **Allowed hosts:** If you configured non-empty `allowedHosts` on the key, cross-origin browser calls must use origins listed in the API server’s **`CORS_ORIGINS`** as well, or the browser will block the request before it reaches Moteur. `Origin`/`Referer` checks are **not** a substitute for keeping the key secret (non-browser clients can spoof headers).
- **Only through channels:** Sites read content only through a channel, with a key. Project routes like `/pages`, `/templates`, `/navigations` and `/forms/:formId` are for Studio and need a JWT. The only key-less endpoint is form submission (`POST /projects/:projectId/forms/:formId/submit`).
- **Read-only:** With only an API key (no JWT), only **GET** is allowed. POST/PATCH/DELETE with key only return **403**.
- **Published by default:** When using the key alone, only **published** content is returned. With JWT, the channel’s status filter is respected.
- **Base path:** If your API uses a base path (e.g. `API_BASE_PATH=/api`), prefix all paths with it: `/api/projects/...`, `/api/auth/...`. Global **studio** routes (usage, seed, asset migration) use `/studio/...` — see [REST API](REST%20API.md).
- **404:** If the URL’s `resourceId` or `channelId` is not in the channel, you get **404**.
- **Kept answers:** Published reads with a key are kept until the project changes (a few seconds at most otherwise); `X-Moteur-Cache` says `hit`, `shared` (asked by several readers at once, worked out once) or `miss`. A change in Moteur shows in the next read.

For full endpoint and option details, see [REST API](REST%20API.md). For TypeScript/JavaScript clients, use [`@moteurio/client`](../packages/client/README.md).

---

## 5. Per-channel API reference (auto-generated)

Global Scalar docs at `{basePath}/docs` describe the **whole** API (Studio, entries, webhooks, …). Frontend developers usually only need **one channel** (channel): concrete URLs, query params, and **`entry.data` shapes** for the models that channel exposes.

Each channel publishes its own OpenAPI 3 document:

```http
GET /projects/:projectId/channels/:channelId/openapi
x-api-key: <your-raw-key>
```

- Paths use your real `projectId`, `channelId`, and model ids (e.g. `/projects/demo/channels/public/issue/entries`), not generic `{resourceId}` placeholders.
- Response schemas reflect **field allowlists** and **reference `resolve` depth** from the channel config.
- **Channel OpenAPI** (`GET …/channels/:channelId/openapi`) is built from the **current** project model/form schemas, not a pinned schema revision. If you change a model in Studio, the spec changes on the next request. To inspect or roll back schema definitions, use [Schema revisions](Schema%20revisions.md) (Studio History or JWT revisions API). **Published entry content** can still be frozen separately via entry publish (`publishedCommit`); that does not freeze the schema contract.
- Same auth and allowlist rules as other channel GET routes.
- A channel resource with **`resourceId: "models"`** expands to **every model** in the project in the spec; an explicit row for one model id overrides field list and resolve depth for that model (same as runtime).

In **Studio → Setup → API channels**, open **API reference** on a channel to browse it, or download the JSON for Postman, Stoplight, or a client generator. The document is built on every request (`Cache-Control: no-store`), so it follows channel and model changes immediately. Also served at `.../openapi.json`.

### The channel's schema

```http
GET /projects/:projectId/channels/:channelId/schema
x-api-key: <your-raw-key>
```

What the channel delivers, described the way Moteur stores it: models (with the channel's field allowlist applied), the templates of its pages, and the blocks and structures those use, each field with its type, label, description and the options that explain its value. Studio presentation (`ui`, `placeholder`, `studio`) and plugin settings are not included; editorial blocks are left out, as delivery strips them. `version` (also the `ETag`) changes with any schema; `If-None-Match` answers 304. `…/types` serves the same schema as TypeScript (`moteur types --channel <id>`). See [Frontend](Frontend.md#the-schema-of-a-channel).

**Hardening before GraphQL:** tighten channel OpenAPI and shared read behavior first; GraphQL would reuse the same projection and auth boundaries later, not replace them.

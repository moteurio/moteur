# Public API & Collections — Quick guide

This guide walks through using the **Public API** with **Collections** and a **project API key** (e.g. for a headless frontend or static site generator).

In TypeScript, use **`createMoteurPublicClient`** from `@moteurio/client` (`collections`, `channel(collectionId)`, `site`, `radar`) — see [packages/client/README.md](../packages/client/README.md).

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

    { "label": "Production site", "allowedCollectionIds": ["<channel-uuid>"], "allowSiteWideReads": false }
    ```

    Omit `allowedCollectionIds` for a key that may read **all** channels. Response includes `rawKey` once plus metadata (`id`, `prefix`, …).

3. **Store the `rawKey`** in a safe place (env var, secrets manager). You will **never** see it again; list metadata later with `GET {basePath}/projects/:projectId/api-keys`.

4. **Optional — allowed hosts / scope:** Use `PATCH {basePath}/projects/:projectId/api-keys/:keyId` with `allowedHosts`, `allowedCollectionIds`, or `allowSiteWideReads`. Non-empty `allowedHosts` requires matching **`Origin`** or **`Referer`** on each `x-api-key` request (see [Authentication](Authentication.md)).

---

## 2. Create a collection

A collection defines _what_ that API key can read: which models and pages, and with which options (fields, status filter, reference resolution).

With the same JWT (and project access):

```http
POST {basePath}/projects/:projectId/collections
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
- **resolve**: `0` = no expansion of references; `1` or `2` = expand reference-like `{ id, type }` values that many levels.

---

## 3. Call the Public API with the key

Send the key **only** in the **`x-api-key`** header (query strings are not supported — they leak via logs and referrers).

```http
GET /projects/:projectId/collections
x-api-key: <your-raw-key>
```

**Example: list collections**

```http
GET /projects/my-blog/collections
x-api-key: mk_live_xxxxxxxx...
```

Response: array of collection objects (id, label, description, resources, …).

**Example: list entries for a model in a collection**

```http
GET /projects/my-blog/collections/:collectionId/blog-post/entries
x-api-key: mk_live_xxxxxxxx...
```

Here `blog-post` is the **resourceId** of the model you added to the collection.

**Example: get one entry**

```http
GET /projects/my-blog/collections/:collectionId/blog-post/entries/:entryId
x-api-key: mk_live_xxxxxxxx...
```

**Example: list pages**

```http
GET /projects/my-blog/collections/:collectionId/pages
x-api-key: mk_live_xxxxxxxx...
```

**Example: get page by slug**

```http
GET /projects/my-blog/collections/:collectionId/pages/by-slug/:slug
x-api-key: mk_live_xxxxxxxx...
```

**Example: get a menu**

```http
GET /projects/my-blog/collections/:collectionId/menus/main
x-api-key: mk_live_xxxxxxxx...
```

Item URLs come resolved (page paths, asset URLs, custom links). A label is text, or one value per language; `?locale=en` returns that language and falls back to the project default. `GET .../menus` lists every menu the collection gives.

**Example: layouts and forms** (when the collection includes `layout` / `form` resources):

```http
GET /projects/my-blog/collections/:collectionId/layouts
GET /projects/my-blog/collections/:collectionId/forms/contact
x-api-key: mk_live_xxxxxxxx...
```

**Query params (entries and pages):**

- **`?resolveUrl=1`** on entry list/get — adds computed `resolvedUrl` when a collection page defines a URL pattern for that model.
- **`?resolveAssets=1`** on entry/page reads — inlines each media field's asset (`_resolved`, with `url` and, for images, `resizeUrl`), and `cropUrl` for fields set to crop, at any depth (blocks, lists, structures, variants). Sizes, crops and `srcset`: see [Images](Images.md).
- **`?locale=`** on entry/page reads — every multilingual value comes down to that language, at any depth, falling back to the project's default language. Link labels, the fields of a page relation and the entries a relation inlined come down too.
- **Relations to entries** are inlined up to the collection resource's `resolve` depth, wherever they sit and whether they are stored as a plain id (as Studio keeps them) or as `{ id }`. Entries the reader can't see keep their id.
- **Links to pages and page relations** are always filled in, on entries and pages, at any depth (blocks, lists, structures, variants): a `core/link` with a `pageId` gets the page's `url`, and a relation with `target: "pages"` becomes `{ id, label, url, fields }`. With **`?locale=`** each address is the one in that language; without, one per language. A page the reader can't see (gone, a folder, a draft outside preview, or outside the collection's page filter) leaves the link with `missing: true` and drops it from relations. See [Fields](Fields.md#core-link).
- Entry lists also support **`limit`**, **`offset`**, and **`sort`** (`id`, `createdAt`, `updatedAt`, `publishedAt`, prefix `-` for descending).

---

## 4. Important points

- **Allowed hosts:** If you configured non-empty `allowedHosts` on the key, cross-origin browser calls must use origins listed in the API server’s **`CORS_ORIGINS`** as well, or the browser will block the request before it reaches Moteur. `Origin`/`Referer` checks are **not** a substitute for keeping the key secret (non-browser clients can spoof headers).
- **Only through collections:** Sites read content only through a collection, with a key. Project routes like `/pages`, `/templates`, `/navigations` and `/forms/:formId` are for Studio and need a JWT. The only key-less endpoint is form submission (`POST /projects/:projectId/forms/:formId/submit`).
- **Read-only:** With only an API key (no JWT), only **GET** is allowed. POST/PATCH/DELETE with key only return **403**.
- **Published by default:** When using the key alone, only **published** content is returned. With JWT, the collection’s status filter is respected.
- **Base path:** If your API uses a base path (e.g. `API_BASE_PATH=/api`), prefix all paths with it: `/api/projects/...`, `/api/auth/...`. Global **studio** routes (usage, seed, asset migration) use `/studio/...` — see [REST API](REST%20API.md).
- **404:** If the URL’s `resourceId` or `collectionId` is not in the collection, you get **404**.

For full endpoint and option details, see [REST API](REST%20API.md). For TypeScript/JavaScript clients, use [`@moteurio/client`](../packages/client/README.md).

---

## 5. Per-collection API reference (auto-generated)

Global Scalar docs at `{basePath}/docs` describe the **whole** API (Studio, entries, webhooks, …). Frontend developers usually only need **one collection** (channel): concrete URLs, query params, and **`entry.data` shapes** for the models that collection exposes.

Each collection publishes its own OpenAPI 3 document:

```http
GET /projects/:projectId/collections/:collectionId/openapi
x-api-key: <your-raw-key>
```

- Paths use your real `projectId`, `collectionId`, and model ids (e.g. `/projects/demo/collections/public/issue/entries`), not generic `{resourceId}` placeholders.
- Response schemas reflect **field allowlists** and **reference `resolve` depth** from the collection config.
- **Collection OpenAPI** (`GET …/collections/:collectionId/openapi`) is built from the **current** project model/form schemas, not a pinned schema revision. If you change a model in Studio, the spec changes on the next request. To inspect or roll back schema definitions, use [Schema revisions](Schema%20revisions.md) (Studio History or JWT revisions API). **Published entry content** can still be frozen separately via entry publish (`publishedCommit`); that does not freeze the schema contract.
- Same auth and allowlist rules as other collection GET routes.
- A collection resource with **`resourceId: "models"`** expands to **every model** in the project in the spec; an explicit row for one model id overrides field list and resolve depth for that model (same as runtime).

In **Studio → Setup → API channels**, open **API reference** on a channel to browse it, or download the JSON for Postman, Stoplight, or a client generator. The document is built on every request (`Cache-Control: no-store`), so it follows channel and model changes immediately. Also served at `.../openapi.json`.

**Hardening before GraphQL:** tighten collection OpenAPI and shared read behavior first; GraphQL would reuse the same projection and auth boundaries later, not replace them.

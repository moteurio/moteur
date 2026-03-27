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
    { "email": "...", "password": "..." }
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
    }
  ]
}
```

- **resourceId** for a model is the model id (e.g. `blog-post`). For pages use `"pages"` (all) or a template id.
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

---

## 4. Important points

- **Allowed hosts:** If you configured non-empty `allowedHosts` on the key, cross-origin browser calls must use origins listed in the API server’s **`CORS_ORIGINS`** as well, or the browser will block the request before it reaches Moteur. `Origin`/`Referer` checks are **not** a substitute for keeping the key secret (non-browser clients can spoof headers).
- **Read-only:** With only an API key (no JWT), only **GET** is allowed. POST/PATCH/DELETE with key only return **403**.
- **Published by default:** When using the key alone, only **published** content is returned. With JWT, the collection’s status filter is respected.
- **Base path:** If your API uses a base path (e.g. `API_BASE_PATH=/api`), prefix all paths with it: `/api/projects/...`, `/api/auth/...`. Global **studio** routes (usage, seed, asset migration) use `/studio/...` — see [REST API](REST%20API.md).
- **404:** If the URL’s `resourceId` or `collectionId` is not in the collection, you get **404**.

For full endpoint and option details, see [REST API](REST%20API.md). For TypeScript/JavaScript clients, use [`@moteurio/client`](../packages/client/README.md).

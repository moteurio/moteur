# REST API Reference

This document describes the **HTTP API** for integrating with Moteur: authenticate, manage projects and content (JWT + project-scoped routes), or read published content for your frontend (public collections). All paths are relative to the API base path (e.g. empty or `/api` via `API_BASE_PATH`). **Project-scoped routes** (webhooks, forms, pages, navigations, collections, API keys, assets, templates, layouts, structures, blocks) live under `/projects/:projectId/...`. Global **studio** routes (request usage counters, blueprint seed, asset migration between providers) use the `/studio/` prefix. For interactive docs, use **Scalar** at `{API_BASE_PATH}/docs` when the server is running; for the OpenAPI spec, see [OpenAPI](#-openapi) below. Authentication uses JWT (Bearer token) for all routes by default, or **project API key** for read-only access to collections, page outputs, and radar (see [Authentication](Authentication.md)).

**Response convention:** List endpoints return a wrapper object `{ resourceName: T[] }` or a bare array where noted. Single-resource endpoints return `{ resourceName: T }` or `{ token, user }` for auth. Errors return `{ error: string }`.

**Project API keys:** For collections, page outputs, and radar endpoints send one secret in the `x-api-key` header only (query parameters are not accepted — they leak in logs and referrers). Key auth is **read-only** (GET only); non-GET requests with only an API key return 403. JWT and API key can coexist; JWT takes precedence. Each key may have **`allowedHosts`**, an optional **collection allowlist**, and optional **site-wide** access; see [Authentication](Authentication.md). All other endpoints require JWT.

**Webhooks (no auth):** `POST /webhooks/mux` and `POST /webhooks/vimeo` are mounted at the application level (no JWT). Signature verification uses **per-project** secrets: `project.videoProviders.mux.webhookSecret` and `project.videoProviders.vimeo.webhookSecret` in each project’s config. The server tries each project that has a non-empty secret until one verifies; there is no separate global “instance” signing secret for these routes. Invalid signatures receive **400**. Register the same URLs in the Mux/Vimeo dashboard for each environment. Processing is asynchronous after responding **200**.

**Request logging & rate limiting:** All API requests are classified as **studio** (global studio routes) or **public** (read-heavy project endpoints). Counts are kept in two separate buckets so you can audit and apply different limits (e.g. high limit on studio routes, per-project limit on public). See [Request logging, rate limiting, and security](#-request-logging-rate-limiting-and-security) below. For a single list of env vars, see [Configuration](Configuration.md).

---

## 🔐 Auth (no JWT required for login)

| Method | Endpoint                | Description                                                                                              |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Log in. Body: `{ email, password }`. Returns `{ token, user }`.                                          |
| GET    | `/auth/providers`       | List auth providers. Returns `{ providers }`.                                                            |
| POST   | `/auth/refresh`         | Refresh JWT. Returns `{ token }`.                                                                        |
| GET    | `/auth/me`              | Current user (requires JWT). Returns `{ user }` with projects, `lastLoginAt?`, etc. (no `passwordHash`). |
| GET    | `/auth/github`          | GitHub OAuth (if enabled).                                                                               |
| GET    | `/auth/github/callback` | GitHub OAuth callback.                                                                                   |
| GET    | `/auth/google`          | Google OAuth (if enabled).                                                                               |
| GET    | `/auth/google/callback` | Google OAuth callback.                                                                                   |

---

## 📁 Projects

All project endpoints require JWT. Project list/get/update/delete may require **operator** (platform) access or project membership depending on implementation.

| Method | Endpoint                             | Description                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects`                          | List all projects (operator). Returns `{ projects }`.                                                                                                                                                                                                                                                      |
| GET    | `/projects/:projectId`               | Get one project. Returns `{ project }`.                                                                                                                                                                                                                                                                    |
| POST   | `/projects`                          | Create a project. Body may include `blueprintId`. Returns created project.                                                                                                                                                                                                                                 |
| PATCH  | `/projects/:projectId`               | Update a project. Returns `{ project }`.                                                                                                                                                                                                                                                                   |
| DELETE | `/projects/:projectId`               | Delete a project.                                                                                                                                                                                                                                                                                          |
| GET    | `/projects/:projectId/users`         | List users with access to the project. See [Project members](#project-members) below.                                                                                                                                                                                                                      |
| PATCH  | `/projects/:projectId/users/:userId` | Update a user record (platform **operator** role only — `admin` / `OPERATOR_ROLE_SLUG`). Target must already be in the project. Body: optional `name`, `email`, `isActive`, `roles` (string array), `avatar` (URL/path or empty string to clear). Returns `{ user }` in the same public shape as the list. |

### Project members

`GET /projects/:projectId/users` requires **JWT** and **project membership** (same as other `/projects/:projectId/*` studio routes). Each element of `users` is a **public** object:

| Field                             | Description                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `email`, `name?`, `avatar?` | Identity and display                                                                                                                                               |
| `roles`                           | Role slugs from `users.json`                                                                                                                                       |
| `isActive`                        | Account enabled                                                                                                                                                    |
| `lastLoginAt?`                    | ISO 8601 time of last successful **password or OAuth** sign-in (not updated on JWT refresh alone)                                                                  |
| `online`                          | `true` if the user currently has **Studio presence** in this project within **`ONLINE_PRESENCE_MAX_IDLE_MS`** (default 90s; see [Configuration](Configuration.md)) |

**Omitted** from this list (never returned): `passwordHash`, `auth` (OAuth ids, etc.), and `projects`.

`PATCH` is for **platform operators** only (the same `admin` role used for `/projects` list/create, `/studio/*`, etc.), in addition to project access. Use it from Studio **Users & Permissions** to edit name, email, active flag, roles, and avatar.

---

## 📋 Activity

Activity events are recorded when entries, layouts, structures, models, users, or blueprints are created, updated, or deleted.

**Project-scoped** (JWT + project access):

| Method | Endpoint                                                  | Description                                                                                                                          |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/projects/:projectId/activity`                           | Page of activity. Query: `limit` (default 50, max 200), `before` (ISO timestamp for next page). Response: `{ events, nextBefore? }`. |
| GET    | `/projects/:projectId/activity/:resourceType/:resourceId` | Activity for one resource (newest first).                                                                                            |

**Global** (operator only):

| Method | Endpoint    | Description                                                                             |
| ------ | ----------- | --------------------------------------------------------------------------------------- |
| GET    | `/activity` | Page of global activity. Query: `limit`, `before`. Response: `{ events, nextBefore? }`. |

**`resourceType`:** `entry`, `layout`, `page`, `structure`, `model`, `project`, `user`, `blueprint`.  
For entries, **`resourceId`** is `modelId__entryId`. Global events have `projectId: "_system"`.

---

## 📦 Collections (Public API)

Named views of project data for external consumers. Authenticate with **project API key** (header `x-api-key` only) or JWT. Default status filter is **published** when using API key only; with JWT the collection’s status filter is respected.

| Method | Endpoint                                                                 | Description                                                                                          |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/collections`                                       | List collections. Returns array of collections.                                                      |
| GET    | `/projects/:projectId/collections/:collectionId`                         | Get one collection.                                                                                  |
| GET    | `/projects/:projectId/collections/:collectionId/:resourceId/entries`     | List entries for a model resource. Pipeline: status filter → reference resolution → field selection. |
| GET    | `/projects/:projectId/collections/:collectionId/:resourceId/entries/:id` | One entry. Same pipeline.                                                                            |
| GET    | `/projects/:projectId/collections/:collectionId/pages`                   | List pages (filtered by collection page resource).                                                   |
| GET    | `/projects/:projectId/collections/:collectionId/pages/:id`               | One page by id.                                                                                      |
| GET    | `/projects/:projectId/collections/:collectionId/pages/by-slug/:slug`     | One page by slug.                                                                                    |

**Field selection:** Collection resources can define `fields: string[]`; only those top-level field names are returned. Omit or empty = all fields.

**Status filter:** Per resource, `filters.status` (default `['published']`). With API key only, only published content is returned.

**Reference resolution:** Per resource, `resolve: 0 | 1 | 2` controls how deep reference-like values (`{ id, type }`) in entry data are expanded.

**Entry URL resolution:** Add `?resolveUrl=1` to entry list or get-one endpoints (collections or project models) to include a computed **`resolvedUrl`** on each entry when a collection page is bound to that model and has a URL pattern. Never stored.

---

## 🌐 Public — Page outputs (sitemap, navigation, urls, breadcrumb)

Project-scoped. Requires **project API key** or **JWT**. Used by frontends and static site generators.

| Method | Endpoint                            | Description                                                                                                                                                                                              |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/sitemap.xml`  | XML sitemap. Includes all resolved URLs with `sitemapInclude`; collection entries expanded when `sitemapIncludeEntries` is true. Uses `project.siteUrl` as base for `<loc>` if set; otherwise path-only. |
| GET    | `/projects/:projectId/sitemap.json` | Same as sitemap.xml but JSON array of `ResolvedUrl[]` (sitemap-included only).                                                                                                                           |
| GET    | `/projects/:projectId/navigation`   | Navigation tree. Query: `depth?`, `rootId?`. Returns `NavigationNode[]` (only `navInclude` nodes; folders only if they have nav-included descendants).                                                   |
| GET    | `/projects/:projectId/urls`         | Flat list of all resolved URLs (static + collection-expanded).                                                                                                                                           |
| GET    | `/projects/:projectId/breadcrumb`   | Query: **`pageId`** (required), `entryId?`. Returns `{ url, breadcrumb: [{ label, url, nodeId, entryId? }] }` from root to current.                                                                      |

---

## 🧭 Public — Navigations

GET is public (uses `optionalProjectAccess`); write operations require JWT. Navigations are **independent of the page tree**: named, ordered, nested menus (e.g. Header, Footer). Items can link to pages, custom URLs, assets, or act as dropdown parents. Resolution happens at read time; page and asset URLs are hydrated. Missing page/asset references do not fail the request — the item’s `url` is `undefined`.

| Method | Endpoint                                   | Description                                                                                                    |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/navigations`         | All navigations, fully resolved (`ResolvedNavigation[]`).                                                      |
| GET    | `/projects/:projectId/navigations/:handle` | One navigation by **handle** (e.g. `header`, `footer`). Returns `ResolvedNavigation`. 404 if handle not found. |

---

## 🗒 Public — Forms

GET uses `optionalProjectAccess` (JWT optional). Form submission (`POST .../submit`) is public with rate limiting only — no auth required, since public website visitors submit forms. Used by frontend form components.

| Method | Endpoint                                    | Description                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/forms/:formId`        | Get public form metadata (fields, labels, successMessage). Omits actions, notifications, recaptcha. 403 if inactive.                                                                                                                                                                                              |
| POST   | `/projects/:projectId/forms/:formId/submit` | Submit a form. Accepts JSON or urlencoded body. Honeypot: include a `_honeypot` field (must be empty for real users). Locale: pass as `_locale` in body or `?locale=` query param. Returns `{ success, submissionId, message, redirectUrl? }`. Rate limited: 60/15min per form (env: `API_RATE_LIMIT_FORMS_MAX`). |

---

## 💬 Comments

Stored per project. All require JWT + project access.

| Method | Endpoint                                    | Description                                                                                                                              |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/projects/:projectId/comments`             | Create a comment. Body: `{ resourceType, resourceId, fieldPath?, blockId?, parentId?, body }`. Returns created comment.                  |
| GET    | `/projects/:projectId/comments`             | List comments. Query: `resourceType`, `resourceId` (required), `fieldPath?`, `includeResolved?` (default false). Returns `{ comments }`. |
| PATCH  | `/projects/:projectId/comments/:id`         | Edit comment. Body: `{ body }`. Author only. Returns updated comment.                                                                    |
| POST   | `/projects/:projectId/comments/:id/resolve` | Mark resolved. Returns updated comment.                                                                                                  |
| DELETE | `/projects/:projectId/comments/:id`         | Delete comment. Author or operator. Returns 204.                                                                                         |

`resourceType` is `entry` or `layout`. For entries, `resourceId` is `modelId__entryId`. Comment body length limit: `COMMENTS_MAX_BODY_LENGTH` (default 10000).

---

## 📋 Review & Approval Workflow

Requires `project.workflow.enabled`. Approve/reject require `reviewer` or **operator** (platform) role. See [Workflows.md](Workflows.md).

| Method | Endpoint                                                              | Description                                                                                                      |
| ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/projects/:projectId/models/:modelId/entries/:entryId/submit-review` | Submit for review. Body: `{ assignedTo?: string }`. Returns `{ review }`.                                        |
| GET    | `/projects/:projectId/reviews`                                        | List reviews. Query: `modelId?`, `entryId?`, `status?` (pending \| approved \| rejected). Returns `{ reviews }`. |
| GET    | `/projects/:projectId/reviews/:reviewId`                              | Get one review. Returns `{ review }`.                                                                            |
| POST   | `/projects/:projectId/reviews/:reviewId/approve`                      | Approve (reviewer or operator). Returns `{ review }`.                                                            |
| POST   | `/projects/:projectId/reviews/:reviewId/reject`                       | Reject. Body: `{ reason: string }`. Returns `{ review }`.                                                        |

---

## 🔔 Notifications

Per-project notifications for review events. JWT + project access.

| Method | Endpoint                                      | Description                                                                              |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/notifications`          | List for current user. Query: `unreadOnly?` (default true). Returns `{ notifications }`. |
| POST   | `/projects/:projectId/notifications/:id/read` | Mark as read. Returns updated notification.                                              |
| POST   | `/projects/:projectId/notifications/read-all` | Mark all read. Returns 204.                                                              |

---

## 📐 Blueprints (global)

Global templates (project, model, or structure). Stored under `data/blueprints/<kind>/` (override: `BLUEPRINTS_DIR`). See [Blueprints.md](Blueprints.md). All require **operator** (platform) access.

**Project blueprints:**

| Method | Endpoint                   | Description                                        |
| ------ | -------------------------- | -------------------------------------------------- |
| GET    | `/blueprints/projects`     | List project blueprints. Returns `{ blueprints }`. |
| GET    | `/blueprints/projects/:id` | Get one. Returns `{ blueprint }`.                  |
| POST   | `/blueprints/projects`     | Create. Body: full blueprint JSON.                 |
| PATCH  | `/blueprints/projects/:id` | Partial update.                                    |
| DELETE | `/blueprints/projects/:id` | Delete.                                            |

**Model blueprints:** Same pattern under `/blueprints/models` and `/blueprints/models/:id`.

**Structure blueprints:** Same pattern under `/blueprints/structures` and `/blueprints/structures/:id`.

---

## 📁 Webhooks (signature-verified, no JWT)

These endpoints are called by the video providers. They are **not** JWT-protected studio routes and do not use Bearer auth. Signature verification is performed first; on failure the response is **400** with no side effects. On success the server responds **200** immediately and processes the payload asynchronously.

| Method | Endpoint          | Description                                                                                         |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/webhooks/mux`   | Mux webhook. Header: `mux-signature`. Configure URL and signing secret in Mux dashboard.            |
| POST   | `/webhooks/vimeo` | Vimeo webhook. Header: `x-vimeo-signature` or `vimeo-signature`. Configure URL and secret in Vimeo. |

---

## 🔗 Webhooks (outbound)

JWT + project access. Outbound webhooks POST a signed JSON payload to your HTTPS endpoint when content events occur (entry published, asset deleted, review approved, etc.). Register an endpoint; Moteur delivers events asynchronously with retries.

**Endpoints:**

| Method | Endpoint                                                         | Description                                                                                                                                                            |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/webhooks`                                  | List webhooks. Secrets redacted. Returns `Webhook[]`.                                                                                                                  |
| POST   | `/projects/:projectId/webhooks`                                  | Create. Body: `{ name, url, secret?, events?, filters?, headers?, enabled? }`. **Secret visible in this response only.** 422 if validation fails (e.g. URL not HTTPS). |
| GET    | `/projects/:projectId/webhooks/:webhookId`                       | Get one. Secret redacted.                                                                                                                                              |
| PATCH  | `/projects/:projectId/webhooks/:webhookId`                       | Update. Secret redacted. 422 if validation fails.                                                                                                                      |
| DELETE | `/projects/:projectId/webhooks/:webhookId`                       | Delete. 204.                                                                                                                                                           |
| POST   | `/projects/:projectId/webhooks/:webhookId/rotate-secret`         | Rotate secret. Returns `{ secret: string }` (new plaintext, shown once).                                                                                               |
| POST   | `/projects/:projectId/webhooks/:webhookId/test`                  | Send test ping. Returns `WebhookDelivery` (result of first attempt).                                                                                                   |
| GET    | `/projects/:projectId/webhooks/:webhookId/log`                   | Delivery log. Query: `limit?` (default 50), `offset?`. Returns `WebhookDelivery[]`.                                                                                    |
| POST   | `/projects/:projectId/webhooks/:webhookId/log/:deliveryId/retry` | Retry a failed delivery. 204. 422 if delivery status is not `failed`.                                                                                                  |

**Payload envelope:** Every delivery sends a POST body with `Content-Type: application/json` and this shape:

```json
{
    "id": "<delivery-uuid>",
    "event": "entry.published",
    "timestamp": "2025-03-08T12:00:00.000Z",
    "projectId": "site1",
    "environment": "production",
    "source": "studio",
    "data": { "entryId": "...", "modelId": "...", "status": "published", "updatedBy": "..." }
}
```

Event types include: `entry.created`, `entry.updated`, `entry.published`, `entry.unpublished`, `entry.deleted`, `asset.created`, `asset.updated`, `asset.deleted`, `page.published`, `page.unpublished`, `page.deleted`, `review.submitted`, `review.approved`, `review.rejected`, `comment.created`, `form.submitted`. The `data` object shape depends on the event (see types in `@moteurio/types/Webhook`).

**Headers:** Each request includes:

- `Content-Type: application/json`
- `X-Moteur-Event`: event name
- `X-Moteur-Delivery`: delivery id
- `X-Moteur-Signature`: `sha256=<HMAC-SHA256(secret, rawBody)>`
- `X-Moteur-Timestamp`: Unix timestamp (seconds)
- Any custom headers configured on the webhook

**Verifying the signature (consumer):** Use the webhook secret and the raw request body (string). Compute `HMAC-SHA256(secret, rawBody)` and compare with the value after `sha256=` in `X-Moteur-Signature` (timing-safe compare recommended).

Node.js example:

```js
const crypto = require('crypto');
function verifySignature(secret, rawBody, signatureHeader) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

Python example:

```py
import hmac
import hashlib

def verify_signature(secret: bytes, raw_body: bytes, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

**Retry schedule:** On non-2xx or network error, Moteur retries with exponential backoff: attempt 2 after 30s, 3 after 5min, 4 after 30min, 5 after 2hr. After 5 attempts the delivery is marked `failed` and can be retried manually via the API or Studio. Retries are in-process (`setTimeout`); they are lost on server restart.

---

## 🗒 Forms

JWT + project access.

| Method | Endpoint                                                       | Description                                                                           |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/forms`                                   | List forms. Returns `{ forms }`.                                                      |
| GET    | `/projects/:projectId/forms/:formId`                           | Get one form (full schema incl. actions, notifications). Returns `{ form }`.          |
| POST   | `/projects/:projectId/forms`                                   | Create a form. Returns `{ form }`. 422 if validation fails.                           |
| PATCH  | `/projects/:projectId/forms/:formId`                           | Update a form. Returns `{ form }`.                                                    |
| DELETE | `/projects/:projectId/forms/:formId`                           | Soft-delete. 204.                                                                     |
| GET    | `/projects/:projectId/forms/:formId/submissions`               | List submissions. Query: `status?`, `limit?` (default 50). Returns `{ submissions }`. |
| GET    | `/projects/:projectId/forms/:formId/submissions/:submissionId` | Get one submission. Returns `{ submission }`.                                         |
| DELETE | `/projects/:projectId/forms/:formId/submissions/:submissionId` | Soft-delete. 204.                                                                     |

---

## 📊 Usage (request counts)

JWT + **operator** role only. Returns current request counts in two buckets: **studio** (global) and **public** (per project). Use for audit and future billing/limits.

| Method | Endpoint        | Description                                                                                                   |
| ------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/studio/usage` | Returns `{ studio: { total, windowStart }, public: { byProject: { [projectId]: { total, windowStart } } } }`. |

---

## 🔑 Project API keys

JWT + project access. Multiple keys per project. Raw secret is returned only on create/rotate.

| Method | Endpoint                                      | Description                                                                                                         |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/api-keys`               | List key metadata (id, prefix, createdAt, allowedHosts, allowlist, allowSiteWideReads). Never hash or raw secret.   |
| POST   | `/projects/:projectId/api-keys`               | Create key. Optional body: `label`, `allowedCollectionIds`, `allowSiteWideReads`. Returns metadata + `rawKey` once. |
| POST   | `/projects/:projectId/api-keys/:keyId/rotate` | Rotate that key. New `rawKey` once; restrictions preserved.                                                         |
| DELETE | `/projects/:projectId/api-keys/:keyId`        | Revoke. 204.                                                                                                        |
| PATCH  | `/projects/:projectId/api-keys/:keyId`        | Update `allowedHosts`, `label`, `allowedCollectionIds` (`null` clears allowlist), `allowSiteWideReads`.             |

---

## 📦 Collections

JWT + project access. CRUD for API collections (define which models/pages and field/status/resolve options are exposed).

| Method | Endpoint                               | Description                                          |
| ------ | -------------------------------------- | ---------------------------------------------------- |
| GET    | `/projects/:projectId/collections`     | List collections.                                    |
| GET    | `/projects/:projectId/collections/:id` | Get one.                                             |
| POST   | `/projects/:projectId/collections`     | Create. Body: `{ label, description?, resources? }`. |
| PATCH  | `/projects/:projectId/collections/:id` | Update.                                              |
| DELETE | `/projects/:projectId/collections/:id` | Hard delete. 204.                                    |

---

## 📄 Pages

JWT + project access. Pages are a **typed tree**: **static** (authored content), **collection** (bound to a model, N URLs per entries), **folder** (structure only). List returns a flat array of `PageNode`; client builds tree from `parentId` and `order`.

| Method | Endpoint                                       | Description                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| GET    | `/projects/:projectId/pages`                   | List all page nodes. Query: `templateId?`, `parentId?`, `status?` (draft \| published), `type?` (static \| collection \| folder).                                                                                                                                                                |
| POST   | `/projects/:projectId/pages`                   | Create. Body: `type`, `label`, `slug`; for static/collection: `templateId`; for collection: `modelId`; optional `parentId`, `urlPattern`, `navInclude`, `sitemapInclude`, etc. Returns `PageNode`. 409 if slug conflict among siblings; 422 if validation fails (cycle, unknown template/model). |
| GET    | `/projects/:projectId/pages/:id`               | Get one.                                                                                                                                                                                                                                                                                         |
| PATCH  | `/projects/:projectId/pages/:id`               | Update. Same validations as create.                                                                                                                                                                                                                                                              |
| DELETE | `/projects/:projectId/pages/:id`               | Soft-delete. **409** if node has children (move or delete children first). 204 on success.                                                                                                                                                                                                       |
| POST   | `/projects/:projectId/pages/reorder`           | Batch reorder. Body: `[{ id, parentId, order }]`. Returns updated `PageNode[]`. Used by Studio drag-and-drop.                                                                                                                                                                                    |
| PATCH  | `/projects/:projectId/pages/:id/status`        | Set status. Body: `{ status: 'draft'                                                                                                                                                                                                                                                             | 'published' }`. |
| POST   | `/projects/:projectId/pages/:id/submit-review` | Submit for review.                                                                                                                                                                                                                                                                               |
| POST   | `/projects/:projectId/pages/validate-all`      | Validate all pages.                                                                                                                                                                                                                                                                              |
| POST   | `/projects/:projectId/pages/:id/validate`      | Validate one page.                                                                                                                                                                                                                                                                               |

---

## 🧭 Navigations

JWT + project access. Navigations are named menus with nested items; items link to pages, custom URLs, assets, or have no destination (dropdown parent). Handle is URL-safe and unique per project.

| Method | Endpoint                               | Description                                                                                                                                                                     |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/navigations`     | List all navigations. Returns `Navigation[]`.                                                                                                                                   |
| POST   | `/projects/:projectId/navigations`     | Create. Body: `{ name, handle, maxDepth?, itemSchema?, items? }`. **409** if handle exists. **422** if validation fails (depth, pageId/assetId not found, handle not URL-safe). |
| GET    | `/projects/:projectId/navigations/:id` | Get one.                                                                                                                                                                        |
| PATCH  | `/projects/:projectId/navigations/:id` | Update. **422** if new `maxDepth` is lower than current deepest item depth (never truncate).                                                                                    |
| DELETE | `/projects/:projectId/navigations/:id` | Delete. 204.                                                                                                                                                                    |

---

## 🗃️ Models

Under a project. JWT + project access. Path param: `projectId`, `modelId`.

| Method | Endpoint                               | Description                                                                                                                                                                                                                                                                                                 |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/models`          | List model schemas. Returns `{ models }`.                                                                                                                                                                                                                                                                   |
| GET    | `/projects/:projectId/models/:modelId` | Get one. Returns `{ model }`.                                                                                                                                                                                                                                                                               |
| POST   | `/projects/:projectId/models`          | Create. Body: full model schema, or **blueprintId** (model blueprint id) plus optional overrides (e.g. id, label). Returns created model.                                                                                                                                                                   |
| PATCH  | `/projects/:projectId/models/:modelId` | Update. Body may include **`urlPattern`** (e.g. `[post.slug]`) for collection page URL generation. Returns updated model; if `urlPattern` was sent and any `[field.path]` reference does not exist on the model, response includes **`urlPatternWarnings`** (array of strings). Validation is warning-only. |
| DELETE | `/projects/:projectId/models/:modelId` | Delete.                                                                                                                                                                                                                                                                                                     |

---

## 📁 Entries

Under a project and model. JWT + project access. Path param: `projectId`, `modelId`, `entryId`.

| Method | Endpoint                                                              | Description                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- | --------------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/models/:modelId/entries`                        | List entries. Returns `{ entries }`. Query: **`?resolveUrl=1`** to add computed `resolvedUrl` when a collection page is bound to this model.                                                                                                    |
| GET    | `/projects/:projectId/models/:modelId/entries/:entryId`               | Get one. Returns `{ entry }`. Query: **`?resolveUrl=1`** to add computed `resolvedUrl`.                                                                                                                                                         |
| POST   | `/projects/:projectId/models/:modelId/entries`                        | Create. Returns created entry.                                                                                                                                                                                                                  |
| PATCH  | `/projects/:projectId/models/:modelId/entries/:entryId`               | Update. Returns `{ entry }`.                                                                                                                                                                                                                    |
| DELETE | `/projects/:projectId/models/:modelId/entries/:entryId`               | Delete.                                                                                                                                                                                                                                         |
| POST   | `/projects/:projectId/models/:modelId/entries/:entryId/submit-review` | Submit for review (see Workflow).                                                                                                                                                                                                               |
| PATCH  | `/projects/:projectId/models/:modelId/entries/:entryId/status`        | Set status. Body: `{ status: 'draft'                                                                                                                                                                                                            | 'in_review' | 'published' | 'unpublished' }`. Operators can bypass review when `workflow.requireReview` is enabled. |
| POST   | `/projects/:projectId/models/:modelId/entries/:entryId/publish`       | Publish the current revision. Captures a git commit hash as `publishedCommit` so the public API can serve frozen content even after further edits. Subject to review guard when `workflow.requireReview` is enabled. Returns the updated entry. |
| GET    | `/projects/:projectId/models/:modelId/entries/:entryId/revisions`     | Revision history from git (newest first). Each commit that touched the entry is one revision. Query: `?max=N` (default 20, max 100). Returns `[{ id, number, message, savedAt, savedBy }]`.                                                     |

---

## 🤖 AI

All AI endpoints use the shared layer ([AI](AI.md)). When no provider is configured, AI is disabled (503; Studio hides AI via `GET /ai/status`). Project-scoped operations consume credits; 402 when insufficient.

| Method | Endpoint                        | Description                                                                                                                                       |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/ai/status`                    | Whether AI is enabled (auth). Used by Studio to show/hide AI UI.                                                                                  |
| POST   | `/ai/write/draft`               | AI draft for field (project access).                                                                                                              |
| POST   | `/ai/write/rewrite`             | Rewrite content (project access).                                                                                                                 |
| POST   | `/ai/write/shorten`             | Shorten content (project access).                                                                                                                 |
| POST   | `/ai/write/expand`              | Expand content (project access).                                                                                                                  |
| POST   | `/ai/write/tone/formal`         | Formal tone (project access).                                                                                                                     |
| POST   | `/ai/write/tone/conversational` | Conversational tone (project access).                                                                                                             |
| POST   | `/ai/write/tone/editorial`      | Editorial tone (project access).                                                                                                                  |
| POST   | `/ai/write/summarise-excerpt`   | Summarise excerpt (project access).                                                                                                               |
| POST   | `/ai/translate/field`           | Translate one multilingual field (project access).                                                                                                |
| POST   | `/ai/translate/entry`           | Translate whole entry into target locales (project access).                                                                                       |
| POST   | `/ai/generate/entry`            | Generate entry from prompt + model schema (project access).                                                                                       |
| POST   | `/ai/generate/fields`           | Generate field definitions from prompt (operator).                                                                                                |
| POST   | `/ai/generate/image`            | _(Legacy)_ Generate single image (auth; global adapter). Prefer `/ai/generate-image` for project-scoped flow.                                     |
| POST   | `/ai/generate-image`            | Generate image variants from prompt (auth; projectId; project `ai.imageProvider`). **402** insufficient credits, **422** provider not configured. |
| POST   | `/ai/save-generated-image`      | Save chosen variant URL to project media library (auth; projectId).                                                                               |
| POST   | `/ai/analyse/image`             | Analyse image for alt/caption (auth; optional entryId/fieldPath for presence). **402** if insufficient credits.                                   |

---

## 👁 Presence (debug)

| Method | Endpoint                                         | Description                                                             |
| ------ | ------------------------------------------------ | ----------------------------------------------------------------------- |
| GET    | `/projects/:projectId/presence/debug`            | Debug presence state.                                                   |
| DELETE | `/projects/:projectId/presence/screen/:screenId` | Clear ephemeral screen state (LWW fields + UI keys) for that screen id. |

---

## 📄 OpenAPI

| Method | Endpoint                  | Description                                                           |
| ------ | ------------------------- | --------------------------------------------------------------------- |
| GET    | `{basePath}/openapi.json` | OpenAPI 3 spec (merged with optional plugins when the server starts). |
| (UI)   | `{basePath}/docs`         | Scalar API reference (same document as `openapi.json`).               |

**Export without running the server** (writes `packages/api/dist-openapi/openapi.json`; uses the same `.env` as the API for optional plugins):

```bash
pnpm --filter @moteurio/api run openapi:export
```

From the monorepo root you can also use `pnpm openapi:export` (see root `package.json`).

**Hosted docs ([docs.api.moteur.io](https://docs.api.moteur.io)):** Either proxy to the production API’s Scalar page (`{basePath}/docs`) or deploy the static shell in [`packages/api-docs/index.html`](../packages/api-docs/index.html) behind your CDN. That file loads Scalar from jsDelivr and points at `https://api.moteur.io/openapi.json` by default—adjust `data-url` if your API uses a non-empty `API_BASE_PATH` (e.g. `https://your-host/api/openapi.json`).

---

## 🛡 Request logging, rate limiting, and security

**Classification:** Every request is classified as **studio** or **public** (or neither). **Studio** = any path under `/studio/`. **Public** = project-scoped read endpoints: `/projects/:projectId/collections/*`, `/projects/:projectId/pages`, `/projects/:projectId/templates`, `/projects/:projectId/forms`, and page outputs (`sitemap.xml`, `sitemap.json`, `navigation`, `urls`, `breadcrumb`). Counts are stored in two separate places so limits can differ (e.g. high limit on studio routes, per-project limit on public).

**Audit log:** If `API_REQUEST_LOG_FILE` (absolute path) or `API_REQUEST_LOG_DIR` is set, each classified request is appended as a JSON line (timestamp, type, projectId, method, path, statusCode, durationMs). **API key and Authorization header are never logged.** Use log rotation (e.g. logrotate) and retain logs as needed for audit or billing disputes.

**Rate limiting:**

| Scope  | Key       | Default                          | Env                         |
| ------ | --------- | -------------------------------- | --------------------------- |
| Studio | IP        | 10000 / 15 min (effectively off) | `API_RATE_LIMIT_STUDIO_MAX` |
| Public | projectId | 1000 / 15 min per project        | `API_RATE_LIMIT_PUBLIC_MAX` |

When exceeded, response is **429** with `{ error: "Too many requests..." }`. Set env to `0` to keep default (studio: high, public: 1000). For multiple API instances, use a shared store (e.g. Redis) with express-rate-limit; see the package docs.

**Security:** [Helmet](https://helmetjs.github.io/) is enabled by default (security headers). Set `HELMET_DISABLED=1` to disable when not in production (e.g. local Swagger); in production this variable is ignored. Set `HELMET_CSP_DISABLED=1` to disable Content-Security-Policy only. Request body size is limited by `API_BODY_LIMIT` (default `1mb`).

**Billing / long-term counts:** In-memory counts reset on restart. To recalculate from the audit log (e.g. for billing or monthly reports), run the recalculation script on the same log file:

```bash
# From repo root (log path as arg or via API_REQUEST_LOG_FILE / API_REQUEST_LOG_DIR)
npx tsx packages/api/scripts/recalculate-usage.ts /var/log/api-requests.log
# Optional: bucket by day or month
USAGE_WINDOW=month npx tsx packages/api/scripts/recalculate-usage.ts /var/log/api-requests.log
```

Output is JSON: `{ source, window, totals: { [windowKey]: { studio, public: { [projectId]: count } } } }`. Older audit logs may use a legacy `type` label for studio-classified requests; those lines are counted in **studio**. Use `USAGE_WINDOW=day` or `USAGE_WINDOW=month` to get per-period breakdowns.

---

## 📌 Notes on routes

- **Layout CRUD** and **Structure CRUD** are mounted under `/projects/:projectId/layouts` and `/projects/:projectId/structures` (JWT + project access). See the Projects section and the table above.
- **Blocks (global catalog):** `GET|POST {basePath}/moteur/blocks` (JWT; POST requires operator). If `API_BASE_PATH` is empty, `/api/moteur/blocks` is also mounted for compatibility. Project-scoped block CRUD is at `/projects/:projectId/blocks` (JWT + project access).
- For **TypeScript/JavaScript over HTTP**, use [`@moteurio/client`](../packages/client/README.md). For **in-process** access inside the monorepo (same Node process as the engine), see [Embedded core API](Developer%20API.md) (`@moteurio/core`).

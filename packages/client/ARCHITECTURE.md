# `@moteurio/client` source layout

## Root (`src/`)

Shared **HTTP kernel** used by both factories (and advanced callers):

- **`client.ts`** — Axios wrapper, `createMoteurClientInternal`, `createRequestClient`; maps API errors to **`MoteurApiError`**; exposes **`_raw`** (axios) on the internal object used by admin and project modules
- **`types.ts`** — config and shared types
- **`credentials.ts`** — env / file credential helpers
- **`index.ts`** — public package exports only

## `admin/` — JWT / full API

Everything wired by **`createMoteurAdminClient`** except the per-resource HTTP modules under `project/`:

| File                 | Role                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`adminClient.ts`** | Composes the admin client surface                                                                                                                                  |
| **`forProject.ts`**  | `createProjectClient` (fixed `projectId`)                                                                                                                          |
| **`auth.ts`**        | `/auth/*`                                                                                                                                                          |
| **`projects.ts`**    | `/projects` (list/create) and nested project routes (branches, radar, comments, **`/projects/:id/activity`**, …)                                                   |
| **`blueprints.ts`**  | `/blueprints/*`                                                                                                                                                    |
| **`activity.ts`**    | `GET /activity` only — cross-project / system-wide log (operator-style); prefer **`projects.activity`** / **`forProject().activity`** for normal per-project audit |
| **`instance.ts`**    | Composes **`client.instance`**: deployment-wide maintenance (usage, seed, migrate)                                                                                 |
| **`deployment/`**    | Low-level HTTP bindings for those maintenance routes (paths match the server’s OpenAPI spec)                                                                       |

## `project/` — `/projects/:projectId/...` resources

One file per **project-scoped** REST area (models, entries, pages, templates, collections CRUD, assets, …). Export pattern: **`projectXxxApi(client)`**.

This is where **models** and **entries** live, same as pages and templates — one tree for “content under a project id”.

## `public/` — API key, read-only

| File                        | Role                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| **`createPublicClient.ts`** | `createMoteurPublicClient` factory                                |
| **`collectionsRead.ts`**    | Collection definition list/get                                    |
| **`collectionChannel.ts`**  | Channel reads (pages, entries, layouts, forms under a collection) |
| **`pageOutputs.ts`**        | Sitemap, navigation tree, urls, breadcrumb                        |
| **`radar.ts`**              | Project radar GET                                                 |

No imports from `admin/` here — keeps the public bundle surface honest.

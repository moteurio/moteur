# Moteur documentation

This folder contains the main documentation for **developers using Moteur**: concepts, APIs, configuration, and tooling. The focus is on integrating with the content API, managing content via the REST API or Studio, and connecting your frontend or SSG.

---

## Where to start

| Goal                                     | Read this                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consume content in a frontend or SSG** | [Public API and Collections](Public%20API%20and%20Collections.md) → then [REST API](REST%20API.md) and [`@moteurio/client`](../packages/client/README.md). |
| **Full HTTP API reference**              | [REST API](REST%20API.md) — auth, projects, collections, CRUD, `/studio/*`, webhooks.                                                                      |
| **Use Moteur from Node/TypeScript**      | [`@moteurio/client`](../packages/client/README.md) over HTTP; [Embedded core API](Developer%20API.md) only for in-process / monorepo work.                 |
| **Run and configure the API**            | [Configuration](Configuration.md) — environment variables.                                                                                                 |
| **Manage content from the terminal**     | [CLI](CLI.md).                                                                                                                                             |
| **Pick a frontend stack**                | [Starters](Starters.md) — Next.js, Astro, Eleventy, etc.                                                                                                   |
| **Authenticate (JWT, API key)**          | [Authentication](Authentication.md).                                                                                                                       |
| **Consume or send webhooks**             | [Webhooks](Webhooks.md).                                                                                                                                   |
| **Field and block types**                | [Fields](Fields.md), [Blocks](Blocks.md).                                                                                                                  |
| **Git, snapshots, and branches**         | [Git integration](Git.md).                                                                                                                                 |

---

## Documentation index

| Document                                                              | Description                                                                                                                                                                |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Public API and Collections**](Public%20API%20and%20Collections.md) | Quick guide: get a project API key, create a collection, and read entries/pages from your frontend.                                                                        |
| [**REST API**](REST%20API.md)                                         | Full HTTP API: auth, projects, models, entries, collections, pages, navigations, studio routes, webhooks. OpenAPI/Swagger details included.                                |
| [**`@moteurio/client`**](../packages/client/README.md)                | Official HTTP client: admin (JWT) and public (API key) factories.                                                                                                          |
| [**Developer API**](Developer%20API.md)                               | Embedded `@moteurio/core` API (in-process); points to source—most integrations should use the client + REST instead.                                                       |
| [**Authentication**](Authentication.md)                               | JWT (login, refresh, OAuth) and project API key (read-only). Env vars for auth.                                                                                            |
| [**Configuration**](Configuration.md)                                 | Environment variables for the Moteur API (base path, CORS, rate limits, auth, storage).                                                                                    |
| [**Git integration**](Git.md)                                         | What is tracked, .gitignore, content branches, workspace/user-data snapshots, restore, snapshot scheduler.                                                                 |
| [**AI**](AI.md)                                                       | AI layer: providers (OpenAI, Anthropic, Mock), configurable credits, writing (per-action endpoints), translation, generate/entry, generate/fields, generate/image, status. |
| [**CLI**](CLI.md)                                                     | CLI reference: projects, models, entries, layouts, structures, templates, pages, workspace, branches, userdata, blueprints.                                                |
| [**Starters**](Starters.md)                                           | Official starters (Next.js, Astro, Eleventy, etc.) — same demo project, same content patterns.                                                                             |
| [**Blueprints**](Blueprints.md)                                       | Blueprint kinds (project, model, structure, template) and how to use them.                                                                                                 |
| [**Workflows**](Workflows.md)                                         | Entry workflow: draft, in_review, published.                                                                                                                               |
| [**Webhooks**](Webhooks.md)                                           | Outbound webhooks: event types, payload, signature verification, retries, filters.                                                                                         |
| [**Presence API**](Presence%20API.md)                                 | WebSocket/Socket.IO: `join`, `presence:update`, field locks, `form:sync`, Studio `screenId` / cursors / overlays.                                                          |
| [**Fields**](Fields.md)                                               | Core field types reference (models, structures, blocks, templates).                                                                                                        |
| [**Blocks**](Blocks.md)                                               | Core block types reference (layouts).                                                                                                                                      |
| [**Seeds**](Seeds.md)                                                 | Canonical blueprints: what they are, how to run seed.                                                                                                                      |
| [**Publishing**](PUBLISHING.md)                                       | Releasing `@moteurio/types`, `@moteurio/client`, and `@moteurio/cli` to npm.                                                                                               |

---

## Ecosystem & external resources

| Resource              | Description                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAPI (Swagger)** | When the Moteur API is running: **Scalar** at `GET {basePath}/docs`, **OpenAPI 3 spec** at `GET {basePath}/openapi.json`. Hosted API docs: [docs.api.moteur.io](https://docs.api.moteur.io). |
| **Moteur Studio**     | UI for content and schema. Source lives in the Studio front-end repository. Storybook: [docs.studio.moteur.io](https://docs.studio.moteur.io/).                                              |
| **Starters**          | Clone-and-run repos for Next.js, Astro, Eleventy, and more. See [Starters](Starters.md) for links and comparison.                                                                            |
| **npm packages**      | Publishing `@moteurio/types`, `@moteurio/client`, and `@moteurio/cli`: see [Publishing](PUBLISHING.md).                                                                                      |

---

## Core concepts (summary)

- **Projects** — Top-level scope; all content and config live inside a project.
- **Collections** — Named views of project data for your app; access with the project **API key** (read-only).
- **Models & entries** — Content types (models) and their data (entries); workflow: draft → in_review → published.
- **Templates & pages** — Page templates define schema; pages form a tree (static pages, collection pages, folders).
- **Navigations** — Menus (e.g. header, footer) with handles for the public API.
- **Blueprints** — Reusable templates for projects, models, structures, and page templates; use **seeds** to install defaults.

For a longer overview, see the main [Moteur README](../README.md).

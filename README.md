# Moteur

**Moteur** is a framework-agnostic content engine for structured, multilingual content. Use it as a **headless CMS**: define models and pages, edit content in **Moteur Studio (or any other API client, such as the Atelier Terminal UI)**, and consume data via the **REST API** and **[`@moteurio/client`](packages/client/README.md)** from your frontend, backend, or static site generator.

- **Content API** — Collections, pages, entries, navigations, sitemaps; read-only **project API key** for frontends and SSG.
- **Admin API** — Full CRUD with JWT; manage projects, models, entries, templates, blueprints, webhooks.
- **Moteur Studio** — Web UI to create and manage projects, content types, pages, and entries.
- **Starters** — Official starters for Next.js, Astro, Eleventy, and more in the `moteur-starters` monorepo (see [Starters](docs/Starters.md)).

Storage is flat JSON files (no database). Optional **blueprints** and **seeds** get you from zero to a content model in one command.

---

## Quick start

1. **Install and build** (from the `moteur` directory):

```bash
 pnpm install && pnpm run build
```

2. **Seed blueprints** (optional — copies seed files into `data/blueprints/` when missing):

```bash
 pnpm run seed
 # Or overwrite existing: pnpm run seed:force
```

3. **Run the API**:

```bash
 pnpm run server:dev
```

API base URL: `http://localhost:3000` (or with `API_BASE_PATH`, e.g. `http://localhost:3000/api`). 4. **Run Moteur Studio** (from `moteur-admin`): create projects, models, templates, pages, and entries from the UI.

```bash
 cd ../moteur-admin && pnpm install && pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173) and point it at your API (e.g. `VITE_API_URL=http://localhost:3000`).

---

## External contributor: run API only

If you only want to run the API locally (without Studio), this is the fastest path:

1. Clone and enter the repo:

```bash
git clone https://github.com/moteurio/moteur.git
cd moteur
```

2. Install and build once:

```bash
pnpm install
pnpm run build
```

3. Create your first user (required for JWT login and admin routes):

```bash
pnpm run cli -- auth create-user
```

4. Start the API:

```bash
pnpm run server:dev
```

5. Verify the server:

- Open API docs at `http://localhost:3000/docs` (or `http://localhost:3000/api/docs` if `API_BASE_PATH=/api`), or
- `GET` the OpenAPI JSON at the same base path (`/openapi.json` or `/api/openapi.json`).

Data is stored locally under `data/` by default, so this setup is enough for local development and testing.

---

## Core concepts

### Projects

The top-level unit. Everything in Moteur is scoped to a **project**: models, entries, layouts, structures, templates, and pages live inside a project. Projects can be created from a **project blueprint** (optional) to apply initial models, layouts, and structures.

### Collections (Public API)

A **Collection** is a named, configured view of project data for your frontend or SSG. Each project has one **API key**. Collections define which models and pages that key can read, with optional field selection, status filters, and reference resolution. Key auth is **read-only** (GET only). See [Public API and Collections](docs/Public%20API%20and%20Collections.md) for setup, [REST API](docs/REST%20API.md) for endpoints, and [`@moteurio/client`](packages/client/README.md) for TypeScript/JavaScript over HTTP.

### Blueprints

Reusable templates with a **kind**. Stored under `data/blueprints/<kind>/`.

| Kind          | Purpose                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| **project**   | Apply initial models, layouts, structures when creating a new project.                |
| **model**     | Create a model in a project from a predefined schema (e.g. Blog Post, Basic Page).    |
| **structure** | Create a project structure from a predefined schema (e.g. Publishable, SEO).          |
| **template**  | Create a page template in a project from a predefined schema (e.g. Landing, Article). |

Create and edit blueprints in **Studio** (Blueprints section) or via the REST API. When creating a model, structure, or template, pass `blueprintId` to instantiate from a blueprint.

### Models & Entries

- **Models** define the schema for a content type (e.g. Product, Article): id, label, description, and **fields**.
- **Entries** are instances of a model, with workflow status (draft, in_review, published) and validation.

### Structures

Reusable bundles of fields (e.g. Publishable, SEO, Team Member). They have a `type` (e.g. `project/seo`), label, and `fields`. Use structure blueprints to add common structures quickly.

### Templates & Pages

- **Templates** (page templates) define the schema for a page: id, label, description, and **fields**.
- **Pages** form a **typed page tree**:
    - **Static pages** — one URL each; created from a template.
    - **Collection pages** — bound to a **model**; index URL plus one URL per published entry (e.g. `[post.slug]`).
    - **Folder nodes** — grouping only; no content, no URL.

The tree drives **sitemap**, **navigation**, **breadcrumbs**, and URL resolution. Public endpoints: `GET /projects/:projectId/sitemap.xml`, `sitemap.json`, `navigation`, `urls`, `breadcrumb`. See [REST API](docs/REST%20API.md) and [`@moteurio/client`](packages/client/README.md).

### Navigations

Named, ordered menus (e.g. Header, Footer). Each has a **handle** (e.g. `header`) used in the public API. Items can link to pages (resolved at read time), custom URLs, assets, or act as dropdown parents. Public: `GET /projects/:projectId/navigations` and `GET /projects/:projectId/navigations/:handle`.

### Webhooks

Outbound HTTPS notifications when content events occur (entry published, asset deleted, form submitted, etc.). Signed payloads (HMAC-SHA256), configurable events and filters, retries, delivery log in Studio. See [REST API](docs/REST%20API.md) and [`@moteurio/client`](packages/client/README.md).

### Layouts & Blocks

- **Layouts** are ordered lists of **blocks** (e.g. hero, sections, footer).
- **Blocks** are content units with a type and data (e.g. `core/hero`, `core/text`). Block _schemas_ are registered globally; _instances_ live in layouts.

### Fields

Atomic data types in models, structures, blocks, and templates: `core/text`, `core/rich-text`, `core/image`, `core/select`, etc. Custom field types can be registered.

### Users & access

Users have credentials and roles (e.g. admin). Access is project-based. The API uses **JWT** for admin and **project API key** for read-only collection access.

---

## Using Moteur

### REST API (HTTP)

- **Public (read-only)** — Use your **project API key** (header `x-api-key` only) to read collections, pages, navigations, sitemaps. See [Public API and Collections](docs/Public%20API%20and%20Collections.md).
- **Admin** — Use **JWT** (Bearer token) for full CRUD: projects, models, entries, templates, blueprints, webhooks, etc. See [REST API](docs/REST%20API.md).

When the server is running:

- **API docs (Scalar)** — `GET {basePath}/docs` (e.g. `/docs` or `/api/docs` when `API_BASE_PATH=/api`).
- **OpenAPI spec** — `GET {basePath}/openapi.json` (e.g. `http://localhost:3000/openapi.json`).

Without the server: `pnpm openapi:export` writes `packages/api/dist-openapi/openapi.json` (same merge as at runtime). CI runs `pnpm --filter @moteurio/api run openapi:check-responses` to guard success responses. Static Scalar shell for [docs.api.moteur.io](https://docs.api.moteur.io): [packages/api-docs/index.html](packages/api-docs/index.html).

### TypeScript / JavaScript client (HTTP)

Use **`@moteurio/client`** for admin (JWT) and public (API key) access over HTTP. See [packages/client/README.md](packages/client/README.md).

### Embedded API (`@moteurio/core`, advanced)

In-process API for the monorepo and tools with direct access to the engine—not the default integration path. See [Developer API](docs/Developer%20API.md) (short note + link to source).

### CLI

Manage projects, models, entries, layouts, structures, templates, and pages from the terminal. See [CLI](docs/CLI.md).

```bash
pnpm run cli
```

### Moteur Studio

The **moteur-admin** app gives you a full admin UI: projects, models, structures, templates, pages, layouts, blocks, entries, blueprints. Use it for content editing and schema setup; use the API or CLI for automation and integration.

---

## Documentation & ecosystem

| Resource                                                                 | Description                                                                                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Documentation index](docs/README.md)**                                | Overview of all docs and where to start.                                                                                                                                |
| **[Public API & Collections](docs/Public%20API%20and%20Collections.md)** | Quick guide: API key, collections, and consuming content.                                                                                                               |
| **[REST API](docs/REST%20API.md)**                                       | Full HTTP API reference (auth, projects, collections, admin).                                                                                                           |
| **[`@moteurio/client`](packages/client/README.md)**                      | Official HTTP client (admin + public factories).                                                                                                                        |
| **[Developer API](docs/Developer%20API.md)**                             | Embedded `@moteurio/core` API (in-process only; contributors / advanced).                                                                                               |
| **[OpenAPI (Swagger)](docs/REST%20API.md#-openapi)**                     | When the API is running: **Scalar** at `{basePath}/docs`, **OpenAPI JSON** at `{basePath}/openapi.json`. Hosted docs: [docs.api.moteur.io](https://docs.api.moteur.io). |
| **[Moteur Studio](../moteur-admin/README.md)**                           | Admin UI repo and setup. Storybook: [docs.studio.moteur.io](https://docs.studio.moteur.io/).                                                                            |
| **[Starters](docs/Starters.md)**                                         | Official starters (Next.js, Astro, Eleventy, etc.) — same demo project, same patterns.                                                                                  |
| **[Configuration](docs/Configuration.md)**                               | Environment variables for the API.                                                                                                                                      |
| **[CLI](docs/CLI.md)**                                                   | CLI reference.                                                                                                                                                          |
| **[Blueprints](docs/Blueprints.md)**                                     | Blueprint kinds and usage.                                                                                                                                              |
| **[Workflows](docs/Workflows.md)**                                       | Entry workflow (draft, review, published).                                                                                                                              |
| **[Presence API](docs/Presence%20API.md)**                               | Real-time presence (e.g. editor cursors).                                                                                                                               |
| **[Authentication](docs/Authentication.md)**                             | JWT and project API key: how to get and use them.                                                                                                                       |
| **[Webhooks](docs/Webhooks.md)**                                         | Outbound webhooks: events, payload, signature verification.                                                                                                             |
| **[Fields](docs/Fields.md)**                                             | Core field types reference.                                                                                                                                             |
| **[Blocks](docs/Blocks.md)**                                             | Core block types reference.                                                                                                                                             |
| **[Seeds](docs/Seeds.md)**                                               | Canonical blueprints and how to run seed.                                                                                                                               |

---

## Reference

### Typical workflow

1. **Configuration** — Set up field types, block definitions, and (optionally) seed blueprints.
2. **Schema** — Create models, structures, and page templates (from scratch or blueprints).
3. **Content** — Create entries, pages, and layouts (in Studio or via API/CLI).
4. **Consume** — Use the Public API (collections, pages, navigations) in your frontend or SSG.

### Seeds

Canonical blueprint seed files live under `data/seeds/blueprints/` (e.g. `project/`, `model/`, `structure/`, `template/`). Run `**pnpm run seed`** to copy missing seeds into `data/blueprints/`; use `**pnpm run seed:force\*\*`to overwrite. See [Seeds](docs/Seeds.md) and`data/seeds/README.md` for details.

### Fields and blocks

Core field types (e.g. `core/text`, `core/rich-text`, `core/image`) and block types (e.g. `core/hero`, `core/text`) are listed in [Fields](docs/Fields.md) and [Blocks](docs/Blocks.md). Custom fields and blocks can be registered via the API or modules.

---

## Features (summary)

Flat-file JSON storage, custom blocks and fields, full multilingual support, blueprints and seeds, **Moteur Studio** admin UI, REST API (JWT + project API key), **API Collections** for headless/SSG, request logging and rate limiting, webhooks, CLI, no database required, extensible (fields, blocks, validators).

---

## Published npm packages

Versioning and release process: [RELEASING.md](RELEASING.md). Change summary: [CHANGELOG.md](CHANGELOG.md).

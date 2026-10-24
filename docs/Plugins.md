# Plugins

Optional behavior is **host-composed**: nothing loads unless the deployment lists it in environment variables. The **`moteur`** repository ships the engine, **`@moteurio/plugin-sdk`**, and built-in core plugins; public plugins live in **`moteur-plugins`**; production composition (which modules to load) lives in hosts such as **`api.moteur.io`**.

**Canonical taxonomy** (global vs project, API vs Studio companion, routes vs schemas only): **[Plugin architecture.md](Plugin%20architecture.md)**.

**Not plugins (always in core):** git commit on save (toggle per project with `project.git.enabled`). **AI** (`/ai` routes) is the private host plugin **`@moteurio/plugin-ai`** in **`moteur-plugins-extra`**; the engine keeps its settings (`project.ai`), credits and audit log (see [AI](AI.md#what-the-engine-keeps-for-the-plugin)). **Presence** (Socket.IO) is the host plugin **`@moteurio/plugin-presence`** in **`moteur-plugins-extra`**; gate with `project.presence.enabled` and host `MOTEUR_HOST_PLUGINS`. Default **block**, **structure**, and **blueprint** catalogs are registered in `@moteurio/core` ([`builtinContent.ts`](../packages/core/src/plugins/builtinContent.ts) and file-based blueprints under `data/blueprints/`).

---

## Types at a glance

| Dimension              | Values                                                                       | Where defined                                      |
| ---------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| **Runtime layer**      | Engine core · Host API plugin · Studio companion · Core feature (git/AI)     | [Plugin architecture.md](Plugin%20architecture.md) |
| **`manifest.scope`**   | **`global`** (ignore `project.plugins`) · **`project`** (allowlist when set) | `PluginManifest` in `@moteurio/types`              |
| **Host enablement**    | `MOTEUR_HOST_PLUGINS`, `MOTEUR_ENABLED_PLUGINS`, operator `plugins.json`     | [Configuration](Configuration.md)                  |
| **Project enablement** | `project.plugins`, `project.presence.enabled`, …                             | Project schema                                     |
| **API surface**        | `init` only · `getRoutes` · `getAuthProviders` · `attachServer`              | Plugin module exports                              |
| **Studio**             | `manifest.studio` hints + optional **`studio-plugin-*`** package             | Composed in private Studio build                   |

---

## Host-level composition

| Variable                 | Description                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MOTEUR_HOST_PLUGINS`    | Comma-separated **import specifiers** (npm package names or local file paths). Each module must export a default `HostPluginModule`.                                                                                                                                                                                                                                                                                   |
| `MOTEUR_ENABLED_PLUGINS` | Optional allowlist of plugin **ids**. When this variable **is set** (even to an empty string), only listed ids from the loaded modules run. When **unset**, every successfully loaded module from `MOTEUR_HOST_PLUGINS` is registered. An operator can switch a host plugin on or off over that list (Studio **Operator › Plugins**, saved in `data/operator/plugins.json`); the choice applies at the next API start. |

Example:

```bash
MOTEUR_HOST_PLUGINS=@moteurio/plugin-auth-github,@moteurio/plugin-storage-s3
MOTEUR_ENABLED_PLUGINS=auth-github,storage-s3
```

See [Configuration](Configuration.md).

---

## Bootstrap flow

1. **`registerCorePlugins()`** — Built-in global plugins (`activity-log`, `audit`, `validation`, `auto-assign-user`) and the content git-commit hook.
2. **`loadHostPluginsFromEnv()`** — Dynamic `import()` of each host specifier; validate manifest + `init`.
3. **`registerHostPlugins(modules)`** — Run each plugin’s `init(ctx)`.
4. **API** — Mount core `/ai`, then each host plugin’s `getRoutes(ctx)` and optional `attachServer` (e.g. presence Socket.IO) (merge OpenAPI).

Implementation: [`packages/api/src/openapi/bootstrapApi.ts`](../packages/api/src/openapi/bootstrapApi.ts), [`packages/api/src/plugins/hostPlugins.ts`](../packages/api/src/plugins/hostPlugins.ts).

---

## Scope and per-project enablement

Each manifest may set:

- **`scope: "global"`** — Host-wide; ignores `project.plugins`.
- **`scope: "project"`** (default when omitted) — Also gated by `project.plugins` when that list is set.

Handlers for project-scoped plugins should call **`ctx.isPluginEnabledForProject(projectId, pluginId)`** and return early when false.

When **`project.plugins` is unset**, all server-enabled project-scoped plugins apply. When set to a list, only those ids run for that project.

---

## Plugin contract

| Export                              | Purpose                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **`manifest`**                      | `PluginManifest` (`id`, `label`, `description`, `source`, optional `scope`, optional `capabilities`, optional **`studio`** hints). |
| **`init(ctx)`**                     | Register event handlers, storage/video/AI adapter factories, etc.                                                                  |
| **`getRoutes(ctx?)`**               | Optional. Returns `{ path, router, openapi? }` or an array. API mounts at `{API_BASE_PATH}{path}`.                                 |
| **`getAuthProviders()`**            | Optional. OAuth/login providers merged into core auth.                                                                             |
| **`attachServer(httpServer, app)`** | Optional low-level hook after the HTTP server exists.                                                                              |

**`PluginRouteContext`** supplies `requireAuth`, `requireProjectAccess`, and `requireOperator`. After `requireProjectAccess`, **`req.user.roles`** are the member’s roles **in that project** (see [Roles in a project](Authentication.md#roles-in-a-project)); use those for project rights and `requireOperator` for platform-wide actions.

---

## SDK boundary

Plugins should depend on **`@moteurio/plugin-sdk`** for context and types. When a plugin needs core itself (a project, an asset, its own stored data, credits), it imports from **`@moteurio/core/host.js`** only: that list is kept stable for plugins released from other repositories, and every other `@moteurio/core/*` path is internal and may change. Need something it doesn't have? Add it to [`host.ts`](../packages/core/src/host.ts) (and its test) rather than importing the file.

List **`@moteurio/core`**, **`@moteurio/types`** and **`@moteurio/plugin-sdk`** as **`peerDependencies`** (and `devDependencies`, to build), not `dependencies`: the plugin then runs on the host's one copy of core, so metering, settings, registries and events are the ones the API set up. The plugin repositories' release checks enforce both rules.

---

## Studio extensions (private Studio, public SDK)

**Moteur Studio** (`@moteurio/studio`, deployed e.g. as studio.moteur.io) is **private**. Plugin authors ship UI with **`@moteurio/studio-plugin-sdk`** and optional companion packages (e.g. **`@moteurio/studio-plugin-qr`**).

| Layer     | Package                                                     | Runs on                                    |
| --------- | ----------------------------------------------------------- | ------------------------------------------ |
| API       | `@moteurio/plugin-*` + `@moteurio/plugin-sdk`               | Host (Node)                                |
| Studio UI | `@moteurio/studio-plugin-*` + `@moteurio/studio-plugin-sdk` | Browser, **composed at Studio build time** |

**API manifest** may declare optional **`studio`** hints (`companionPackage`, `fieldTypes`, `blockTypes`, `projectRoutes`) — metadata only, no React over HTTP. Operator **`GET /operator/plugins`** includes `studio` when present.

**Studio host** (in the private repo) lists modules in `src/studioPlugins/config.ts`, calls `applyStudioPlugins(modules, adapter)` at startup, and maps registrations onto the field registry (`registerFieldType`). Same plugin **id** as the API (`qr`, `poll`, …).

**Self-hosted API only:** omit Studio packages; schemas still work — unknown field types stay read-only in Studio.

**SDK** (published from `moteur`): [`studio-plugin-sdk`](../packages/studio-plugin-sdk/README.md).

**Reference companions** (private repo **`moteur-plugins-extra`**, tarball release — not npm): `studio-plugin-qr`, `studio-plugin-oembed`, `studio-plugin-poll`, `studio-plugin-3d-viewer`, `studio-plugin-media-lottie-rive` under `packages/studio-plugin-*`, paired with API packages `plugin-qr`, `plugin-poll`, `plugin-3d-viewer`, `plugin-media-lottie-rive` in the same repo. Billing remains first-party Studio code calling **`plugin-billing`** routes (pattern for full-stack plugins).

**HTTP reference for plugin authors:** [docs.api.moteur.io](https://docs.api.moteur.io) (OpenAPI for the **api.moteur.io** host composition — built from the api.moteur.io repo, not the engine-only export).

---

## Typical open-source plugins (`@moteurio/plugin-*`)

Published from **`moteur-plugins`** (not bundled in the `moteur` workspace). Install the packages on the host and list them in `MOTEUR_HOST_PLUGINS`. Rows marked **`moteur-plugins-extra`** are private: storage, video hosts, search, **`@moteurio/plugin-ai`** (and **`ai-provider-*`**), billing, presence, and several play/media integrations (`3d-viewer`, `poll`, `qr`, `media-lottie-rive`, `shopify`) are released as tarballs on that repository's GitHub Releases for api.moteur.io, not on npm. Versions `2026.3.27` of the storage, video, search and AI provider plugins remain on npm under MIT.

| Id                                                                                              | Role                                                                                          |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `geo`                                                                                           | Geo field types and `geo/map` block                                                           |
| `oembed`                                                                                        | `play/oembed` block + resolve API                                                             |
| `3d-viewer` (`moteur-plugins-extra`)                                                            | `play/3d-viewer` block + Meshy blueprint                                                      |
| `poll` (`moteur-plugins-extra`)                                                                 | `play/poll` block + public vote API                                                           |
| `qr` (`moteur-plugins-extra`)                                                                   | `play/qr` field/block + SVG route                                                             |
| `media-lottie-rive` (`moteur-plugins-extra`)                                                    | `media/lottie` / `media/rive` blocks; `media/lottie-asset` / `media/rive-asset` field editors |
| `storage-s3` / `storage-r2` / `storage-minio` / `storage-cloudinary` (`moteur-plugins-extra`)   | Remote asset adapters (MinIO is S3-compatible; set `endpoint` in config)                      |
| `video-mux`, `video-vimeo`, `video-cloudflare-stream`, `video-youtube` (`moteur-plugins-extra`) | Video providers and inbound webhooks                                                          |
| `auth-github`, `auth-google`, `auth-microsoft`, `auth-oidc`                                     | OAuth / OIDC routes under `/auth/...`                                                         |
| `shopify` (`moteur-plugins-extra`)                                                              | Product sync + `POST /webhooks/shopify`                                                       |
| `presence` (`moteur-plugins-extra`)                                                             | Socket.IO presence, field locks, screen sync + HTTP debug routes                              |
| `webhook-slack`, `webhook-vercel`, `webhook-github`                                             | Verified inbound webhook endpoints                                                            |
| `search-algolia`, `search-meilisearch` (`moteur-plugins-extra`)                                 | Entry indexing and Studio search routes                                                       |

**Text AI** uses host plugins **`ai`** (`@moteurio/plugin-ai`) and **`ai-provider-*`** from **`moteur-plugins-extra`**, with **`MOTEUR_AI_PROVIDER`** and env keys (see [AI](AI.md)). Load provider plugins before **`plugin-ai`**.

---

## Adding a new plugin

1. Create a package (in **`moteur-plugins`** or a private repo) with `manifest`, `init`, and optional `getRoutes` / `getAuthProviders`.
2. Publish or build to a path the host can `import`.
3. Add the specifier to the host’s **`MOTEUR_HOST_PLUGINS`** and id to **`MOTEUR_ENABLED_PLUGINS`** when using an allowlist.
4. For per-project behavior, use **`scope: "project"`** and **`ctx.isPluginEnabledForProject`**.

Public plugins live in the [`moteur-plugins`](https://github.com/moteurio/moteur-plugins) repository; Moteur Cloud's private plugins in `moteur-plugins-extra`.

---

## Testing matrix

- **`MOTEUR_HOST_PLUGINS` unset** — No host plugins; OAuth plugin routes, presence, and plugin-only webhooks return **404**. Core `/ai` and git-commit still run (subject to project flags).
- **Allowlist empty** — Set `MOTEUR_ENABLED_PLUGINS=` with plugins listed in `MOTEUR_HOST_PLUGINS`; none of those ids run.
- **Integration tests** — Start the API with a given env matrix and assert routes exist or return 404. OpenAPI export uses the same bootstrap: `pnpm openapi:export`.

---

## See also

- [Configuration](Configuration.md) — `MOTEUR_HOST_PLUGINS`, `MOTEUR_ENABLED_PLUGINS`
- [REST API](REST%20API.md) — HTTP surface merged from plugins
- [`@moteurio/plugin-sdk`](../packages/plugin-sdk/README.md)
- [`@moteurio/studio-plugin-sdk`](../packages/studio-plugin-sdk/README.md)

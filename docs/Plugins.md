# Plugins

Optional behavior is **host-composed**: nothing loads unless the deployment lists it in environment variables. The **`moteur`** repository ships the engine, **`@moteurio/plugin-sdk`**, and built-in core plugins; public plugins live in **`moteur-plugins`**; production composition (which modules to load) lives in hosts such as **`api.moteur.io`**.

**Not plugins (always in core):** git commit on save, **presence** (Socket.IO), and **AI** (`/ai` routes). Toggle per project with `project.git.enabled`, `project.presence.enabled`, and `project.ai.enabled`. Default **block**, **structure**, and **blueprint** catalogs are registered in `@moteurio/core` ([`builtinContent.ts`](../packages/core/src/plugins/builtinContent.ts) and file-based blueprints under `data/blueprints/`).

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
4. **API** — Mount core `/ai` and presence routers, then each host plugin’s `getRoutes(ctx)` (merge OpenAPI).

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

| Export                              | Purpose                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **`manifest`**                      | `PluginManifest` (`id`, `label`, `description`, `source`, optional `scope`, optional `capabilities`). |
| **`init(ctx)`**                     | Register event handlers, storage/video/AI adapter factories, etc.                                     |
| **`getRoutes(ctx?)`**               | Optional. Returns `{ path, router, openapi? }` or an array. API mounts at `{API_BASE_PATH}{path}`.    |
| **`getAuthProviders()`**            | Optional. OAuth/login providers merged into core auth.                                                |
| **`attachServer(httpServer, app)`** | Optional low-level hook after the HTTP server exists.                                                 |

**`PluginRouteContext`** supplies `requireAuth`, `requireProjectAccess`, and `requireOperator`. After `requireProjectAccess`, **`req.user.roles`** are the member’s roles **in that project** (see [Roles in a project](Authentication.md#roles-in-a-project)); use those for project rights and `requireOperator` for platform-wide actions.

---

## SDK boundary

Plugins should depend on **`@moteurio/plugin-sdk`** for context and types. Avoid deep imports from `@moteurio/core/*` so plugins can live in separate repositories.

---

## Typical open-source plugins (`@moteurio/plugin-*`)

Published from **`moteur-plugins`** (not bundled in the `moteur` workspace). Install the packages on the host and list them in `MOTEUR_HOST_PLUGINS`.

| Id                                                                     | Role                                    |
| ---------------------------------------------------------------------- | --------------------------------------- |
| `geo`                                                                  | Geo field types and `geo/map` block     |
| `storage-s3` / `storage-r2`                                            | Remote asset adapters                   |
| `video-mux`, `video-vimeo`, `video-cloudflare-stream`, `video-youtube` | Video providers and inbound webhooks    |
| `auth-github`, `auth-google`                                           | OAuth routes under `/auth/...`          |
| `webhook-slack`, `webhook-vercel`, `webhook-github`                    | Verified inbound webhook endpoints      |
| `search-algolia`, `search-meilisearch`                                 | Entry indexing and Studio search routes |

**Text AI** is configured with **`MOTEUR_AI_PROVIDER`** and env keys in `@moteurio/ai` (see [AI](AI.md)), not via a plugin id. Host plugins may still extend storage, auth, or search.

---

## Adding a new plugin

1. Create a package (in **`moteur-plugins`** or a private repo) with `manifest`, `init`, and optional `getRoutes` / `getAuthProviders`.
2. Publish or build to a path the host can `import`.
3. Add the specifier to the host’s **`MOTEUR_HOST_PLUGINS`** and id to **`MOTEUR_ENABLED_PLUGINS`** when using an allowlist.
4. For per-project behavior, use **`scope: "project"`** and **`ctx.isPluginEnabledForProject`**.

The old `packages/plugins/*` tree in this repo is **transitional** — see [`packages/plugins/README.md`](../packages/plugins/README.md).

---

## Testing matrix

- **`MOTEUR_HOST_PLUGINS` unset** — No host plugins; OAuth plugin routes and plugin-only webhooks return **404**. Core `/ai`, presence, and git-commit still run (subject to project flags).
- **Allowlist empty** — Set `MOTEUR_ENABLED_PLUGINS=` with plugins listed in `MOTEUR_HOST_PLUGINS`; none of those ids run.
- **Integration tests** — Start the API with a given env matrix and assert routes exist or return 404. OpenAPI export uses the same bootstrap: `pnpm openapi:export`.

---

## See also

- [Configuration](Configuration.md) — `MOTEUR_HOST_PLUGINS`, `MOTEUR_ENABLED_PLUGINS`
- [REST API](REST%20API.md) — HTTP surface merged from plugins
- [`@moteurio/plugin-sdk`](../packages/plugin-sdk/README.md)

# Plugins

Plugins are host-composed and fully optional.

- `@moteurio/core` registers only built-in core plugins.
- `@moteurio/api` loads host-provided plugins from `MOTEUR_HOST_PLUGINS`.
- No plugin is loaded unless the host explicitly installs and enables it.

## Host-level composition

Use host environment variables:

- `MOTEUR_HOST_PLUGINS`: comma-separated module specifiers (npm package names or local paths)
- `MOTEUR_ENABLED_PLUGINS`: optional comma-separated plugin ids that are allowed to run

Example:

```bash
MOTEUR_HOST_PLUGINS=@moteurio/plugin-auth-github,./plugins/private-billing/dist/index.js
MOTEUR_ENABLED_PLUGINS=auth-github,private-billing
```

## Scope model

Each plugin manifest can set:

- `scope: "global"`: host-wide behavior, ignores per-project plugin lists
- `scope: "project"`: host-enabled, then gated by `project.plugins`

When `scope` is omitted, runtime treats it as `project`.

## Plugin contract

- `manifest`: `PluginManifest` (with optional `scope`)
- `init(ctx)`: register handlers/adapters/providers
- `getRoutes(ctx)`: optional router/OpenAPI contribution
- `attachServer(httpServer, app)`: optional low-level server hook

## SDK boundary

Plugins should depend on `@moteurio/plugin-sdk` for plugin context/types.
Avoid deep imports from `@moteurio/core/*` so plugins can live in separate repositories.

## Repository ownership

- `moteur`: core runtime packages and plugin SDK
- `moteur-plugins`: public plugins
- `api.moteur.io` (private): deployable composition host

# Plugins

Optional plugins for Moteur are host-composed via `MOTEUR_HOST_PLUGINS`. Features are **gated**: they only run when the plugin is enabled. The API mounts routes and merges OpenAPI from plugins that export `getRoutes(context)`.

**Core features** (not plugins): git-commit, presence, and AI are built-in and always active; they are not in the plugin registry. They can be toggled per-project via `project.git.enabled`, `project.presence.enabled`, and `project.ai.enabled`.

## Two-level enablement

1. **Server level (registration)**  
   Plugins are active when registered on the server. Configure host plugins via `MOTEUR_HOST_PLUGINS` and (optionally) filter with `MOTEUR_ENABLED_PLUGINS`:
    - `MOTEUR_HOST_PLUGINS`: comma-separated module specifiers (npm package names or local paths).
    - `MOTEUR_ENABLED_PLUGINS`: optional comma-separated plugin IDs allowlist.

2. **Per-project**  
   Each project can enable/disable optional plugins via `project.plugins` (or by tier, when applicable):
    - **Unset**: all server-enabled plugins apply to that project.
    - **Set to a list**: only the listed plugin IDs run for that project.

Plugins that act per-project must call `ctx.isPluginEnabledForProject(projectId, pluginId)` in their handlers and return early when false.

## Plugin contract

- **`manifest`**: `PluginManifest` (id, label, description, source, kind).
- **`init(ctx: PluginContext)`**: called at server start; register event handlers, adapter/provider factories, etc.
- **`getRoutes(ctx?: PluginRouteContext)`** (optional): called by the API after init; returns `{ path, router, openapi? }`. The API mounts `router` at `basePath + path` and merges `openapi.paths` into the OpenAPI spec. Plugins that register routes receive `PluginRouteContext` with `requireAuth`, `requireProjectAccess`, `requireOperator` (and optionally `authCallbacks.runOnboardingForNewUser` for auth provider plugins) so they can protect routes without depending on the API package.
- **`attachServer(httpServer, app)`** (optional): called by the API after the HTTP server is created (e.g. presence core feature sets `app.locals.io`).

## Included open-source plugins (@moteurio/plugin-\*)

| Id                        | Description                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `geo`                     | Geo field types (`geo/location`, `geo/area`, `geo/polyline`) and `geo/map` block.                                                                                                                                                                                                                                                                 |
| `storage-s3`              | Amazon S3 asset storage. Set project `assetConfig.adapter` to `s3` with `adapterConfig`.                                                                                                                                                                                                                                                          |
| `storage-r2`              | Cloudflare R2 asset storage. Set project `assetConfig.adapter` to `r2` with `adapterConfig`.                                                                                                                                                                                                                                                      |
| `video-mux`               | Mux video uploads and webhooks. Set env `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (and optional `MUX_WEBHOOK_SECRET` for instance defaults). **Inbound** `POST /webhooks/mux` signatures are verified with each project’s `videoProviders.mux.webhookSecret`.                                                                                            |
| `video-vimeo`             | Vimeo video uploads and webhooks. Set env `VIMEO_ACCESS_TOKEN` (and optional `VIMEO_WEBHOOK_SECRET` for instance defaults). **Inbound** `POST /webhooks/vimeo` signatures are verified with each project’s `videoProviders.vimeo.webhookSecret`.                                                                                                  |
| `video-cloudflare-stream` | Cloudflare Stream direct uploads and webhooks. Set env `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_WEBHOOK_SECRET`. **Inbound** `POST /webhooks/cloudflare-stream` uses `Webhook-Signature` (HMAC) with each project’s `videoProviders.cloudflareStream.webhookSecret`.                                                             |
| `video-youtube`           | YouTube uploads via OAuth refresh token. Set env `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. No inbound webhooks (upload completes synchronously).                                                                                                                                                                     |
| `ai-provider-openai`      | Registers OpenAI as an AI provider. Use with core AI and `MOTEUR_AI_PROVIDER=openai`.                                                                                                                                                                                                                                                             |
| `ai-provider-anthropic`   | Registers Anthropic Claude. Use with core AI and `MOTEUR_AI_PROVIDER=anthropic`.                                                                                                                                                                                                                                                                  |
| `ai-provider-google`      | Registers Google Gemini. Use with `MOTEUR_AI_PROVIDER=google` and `GOOGLE_AI_API_KEY` or `GEMINI_API_KEY`.                                                                                                                                                                                                                                        |
| `ai-provider-fal`         | Registers fal.ai. Use with `MOTEUR_AI_PROVIDER=fal` and `FAL_KEY`. Also used when `project.ai.imageProvider` is `fal` (via the registered factory).                                                                                                                                                                                               |
| `auth-github`             | GitHub OAuth: GET `/auth/github`, GET `/auth/github/callback`. Set `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, `AUTH_GITHUB_REDIRECT_URI`.                                                                                                                                                                                              |
| `auth-google`             | Google OAuth: GET `/auth/google`, GET `/auth/google/callback`. Set `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_GOOGLE_REDIRECT_URI`.                                                                                                                                                                                              |
| `core-blocks`             | Default block schemas (paragraph, heading, image, spacer, quote, divider, button). When enabled, they are registered so `listBlocks()` returns them.                                                                                                                                                                                              |
| `core-blueprints`         | Default blueprints (blog, empty, blog-post, basic-page, seo, default template). When enabled, they are registered so `listBlueprints()` / `getBlueprint()` return them.                                                                                                                                                                           |
| `webhook-slack`           | POST `/webhooks/slack` for Slack incoming webhooks. Verifies `X-Slack-Signature` and `X-Slack-Request-Timestamp`. Set `SLACK_SIGNING_SECRET`.                                                                                                                                                                                                     |
| `webhook-vercel`          | POST `/webhooks/vercel` for Vercel deploy hooks. Verifies `x-vercel-signature`. Set `VERCEL_WEBHOOK_SECRET`.                                                                                                                                                                                                                                      |
| `webhook-github`          | POST `/webhooks/github` for GitHub repository webhooks. Verifies `X-Hub-Signature-256` (HMAC-SHA256 of raw body). Set `GITHUB_WEBHOOK_SECRET`. Responds with JSON to `ping` events.                                                                                                                                                               |
| `search-algolia`          | Indexes entries on `content.saved` / removes on `content.deleted`. Per-project index name `moteur-{projectId}`. Env: `MOTEUR_ALGOLIA_APP_ID`, `MOTEUR_ALGOLIA_ADMIN_API_KEY`. Studio: `GET /projects/{projectId}/search/algolia?q=` (JWT + project access), `POST .../reindex` (operator). Run reindex once after enable to apply index settings. |
| `search-meilisearch`      | Same sync model as Algolia for Meilisearch. Env: `MOTEUR_MEILISEARCH_HOST` (e.g. `http://127.0.0.1:7700`), optional `MOTEUR_MEILISEARCH_API_KEY`. Studio: `GET /projects/{projectId}/search/meilisearch?q=`, `POST .../reindex`.                                                                                                                  |

**Core features (not plugins, always active):** Git-commit (content → git commit/push), presence (Socket.IO + form state, toggled per-project by `project.presence.enabled`), AI (`/ai` routes and image analysis, toggled per-project by `project.ai.enabled`).

## Adding a plugin

1. Add a new package under `packages/plugins/plugin-<id>/` (e.g. `plugin-my-feature`) with its own `package.json`, `tsconfig.json`, and `src/index.ts` (or add to a private package).
2. Export `manifest` (source: `'opensource'` or `'private'`, kind: `'optional'`) and `init(ctx: PluginContext)`.
3. Optionally export `getRoutes(ctx: PluginRouteContext)` returning `{ path, router, openapi? }`; optionally export `attachServer(httpServer, app)` to attach to the HTTP server.
4. Register the loader in `OPEN_SOURCE_PLUGIN_LOADERS` in `packages/core/src/plugins/registerCorePlugins.ts` and add the id to `DEFAULT_OPTIONAL_PLUGIN_IDS` if it should be on by default; or export `getPrivatePlugins()` in a private package.
5. For per-project behavior, call `ctx.isPluginEnabledForProject(projectId, manifest.id)` at the start of event handlers.

## Self-contained plugins

- Depend only on `@moteurio/core`, `@moteurio/types`, and optionally `@moteurio/ai` for AI plugins.
- Avoid deep imports so the plugin can be moved to a separate repo later.

## Private (closed-source) plugins

See [plugins-private-repo.md](plugins-private-repo.md) for loading plugins from private npm packages or local file paths via `MOTEUR_HOST_PLUGINS`.

## Testing: plugins enabled vs disabled

- **All optional plugins off**: leave `MOTEUR_HOST_PLUGINS` empty (or set only non-auth plugins). Then:
    - Core features remain: `/ai/*`, presence, and git-commit on save still work (they are not plugins).
    - `/auth/github`, `/auth/google` and their callbacks are **404** (auth provider plugins not loaded).
    - **core-blocks** / **core-blueprints** disabled: only file-based blocks and blueprints (e.g. from `data/`) are available; default built-ins are not registered.
    - `/webhooks/slack`, `/webhooks/vercel` are **404** (Mux/Vimeo/Cloudflare Stream asset webhooks remain only if those video plugins are enabled).
    - No S3/R2/Mux/Vimeo unless you enable those plugins.
- **Only AI providers**: set `MOTEUR_HOST_PLUGINS` to the desired AI provider plugin module specifiers and optionally restrict via `MOTEUR_ENABLED_PLUGINS`. Then:
    - Core AI is always active; with these plugins the API can use OpenAI/Anthropic. Other optional plugins (storage-s3, etc.) are not loaded.
- **Defaults (no env)**: no host plugins are loaded by default.
- **Integration tests**: start the API with a given `MOTEUR_HOST_PLUGINS`/`MOTEUR_ENABLED_PLUGINS` matrix and assert expected routes exist or return 404 when the corresponding plugin is disabled.

## Architecture summary

- **Core** runs `registerCorePlugins()` then `registerOptionalPlugins(enabledIds, options)`. Optional plugins are loaded from individual `@moteurio/plugin-*` packages (core has a static loader map) and optionally from a private package/path; only `enabledIds` are inited.
- **API** calls `getOptionalPluginLoaders(options)` to get the same loader map, then for each enabled plugin loads the module and, if `getRoutes` exists, calls `getRoutes(routeContext)` and mounts the returned router and merges OpenAPI. No feature-specific conditionals in the API.

## Tests

- **Core** (`packages/core`): `pnpm test` runs unit tests including `registerCorePlugins` / `getOptionalPluginLoaders`. The loader map is built from the static `OPEN_SOURCE_PLUGIN_LOADERS`; plugin packages must be installed for their loaders to resolve at runtime.
- **API** (`packages/api`): AI route tests use the plugin’s `getOptionalPluginLoaders()` from core and the plugin's `getRoutes(mockContext)` to build the `/ai` router. Run from the monorepo after `pnpm build` so `@moteurio/core` and `@moteurio/plugin-*` resolve. Tests for logic (e.g. `writing.test.ts`, `translation.test.ts`, `imageAnalysis.test.ts`) still import from `api/src/ai/` (writing, translation, imageAnalysis).

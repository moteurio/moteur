# @moteurio/api

Express **REST API** for Moteur: JWT admin routes, read-only **project API key** collections, Scalar docs, merged **OpenAPI 3**, webhooks, and in-process integration with `@moteurio/core` and `@moteurio/ai`. Real-time presence is provided by the **`@moteurio/plugin-presence`** host plugin when loaded.

Product documentation: monorepo [`docs/`](../../docs/README.md). HTTP reference: [REST API](../../docs/REST%20API.md). Configuration: [Configuration](../../docs/Configuration.md). Plugins: [Plugins](../../docs/Plugins.md).

## Install

```bash
npm install @moteurio/api
```

Node **22+** (`engines` in `package.json`).

## Run (monorepo)

From the repo root:

```bash
pnpm run server:dev    # tsx entry: packages/api/src/index.ts
pnpm run server        # built dist (after pnpm build)
```

Interactive docs: `GET {basePath}/docs` (Scalar). Spec: `GET {basePath}/openapi.json`.

## Bootstrap

Startup loads `.env` from the monorepo root when present, validates storage paths, then:

1. **`registerCorePlugins()`** — built-in global plugins and git commit hook (`@moteurio/core`).
2. **`loadHostPluginsFromEnv()`** — optional modules from `MOTEUR_HOST_PLUGINS` / `MOTEUR_ENABLED_PLUGINS`.
3. **`initAiFromEnv()`** — text AI adapter from `MOTEUR_AI_PROVIDER` (`@moteurio/ai`).
4. **`bootstrapApi()`** — merge OpenAPI, mount `/ai`, host plugin routers (including presence when enabled).

Implementation: [`src/openapi/bootstrapApi.ts`](src/openapi/bootstrapApi.ts), [`src/index.ts`](src/index.ts).

## OpenAPI

| Task                                             | Command                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Export merged spec (no server)                   | `pnpm --filter @moteurio/api run openapi:export` → `packages/api/dist-openapi/openapi.json` |
| Same from repo root                              | `pnpm openapi:export`                                                                       |
| CI: success responses must document JSON schemas | `pnpm --filter @moteurio/api run openapi:check-responses` or `pnpm openapi:check`           |

Export uses the same **`buildMergedOpenApiDocument()`** as runtime. Env (host plugins, AI provider) affects which paths appear — load `moteur/.env` when exporting locally.

Optional: set **`MOTEUR_FAIL_ON_OPENAPI_COLLISION=1`** so duplicate path/method merges fail fast at bootstrap.

**Per-collection spec** (public channel, API key): `GET /projects/:projectId/collections/:collectionId/openapi` (also `.../openapi.json`). Built on each request; see [Public API and Collections](../../docs/Public%20API%20and%20Collections.md#5-per-collection-api-reference-auto-generated).

## Package scripts

| Script                    | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `build`                   | `tsc -b` → `dist/`                      |
| `test`                    | Plugin import guard + Vitest            |
| `openapi:export`          | Write `dist-openapi/openapi.json`       |
| `openapi:check-responses` | Lint 2xx response bodies in merged spec |

## Auth model (summary)

- **JWT** — default for Studio and CRUD (`Authorization: Bearer …`).
- **`x-api-key`** — read-only on collections, page outputs, radar, and collection OpenAPI (GET only).
- Login body field is **`username`** (email is accepted when used as username). See [Authentication](../../docs/Authentication.md).

## Publishing

This package is published on the calendar line documented in [RELEASING.md](../../RELEASING.md).

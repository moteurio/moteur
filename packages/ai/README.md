# @moteurio/ai

Provider-agnostic **AI layer** for Moteur: env-based text adapters, per-project credits, writing/translation/image helpers, and the **`/ai` Express router** mounted by `@moteurio/api`.

Full behavior and endpoints: [AI](../../docs/AI.md). Configuration env vars: [Configuration](../../docs/Configuration.md#ai).

## Install

```bash
npm install @moteurio/ai
```

Node **22+** (`engines` in `package.json`). Typically consumed as a dependency of `@moteurio/api`, not directly from frontends.

## Enable text AI

Set **`MOTEUR_AI_PROVIDER`** to `openai`, `anthropic`, or `mock`, plus the matching API key env vars. When unset, `getAdapter()` returns `null` and `/ai` routes respond with **503**.

Call **`initAiFromEnv()`** once at server startup (the API does this in `bootstrapApi`).

Image, audio, and 3D generation use **`getImageAdapter`**, **`getAudioAdapter`**, and **`getModel3dAdapter`** with project `ai.imageProvider`, `ai.audioProvider`, and `ai.model3dProvider` — separate from the global text provider.

## HTTP surface (mounted by the API)

Router factory: **`createAiRouter(ctx)`** at `{basePath}/ai`. OpenAPI fragment: **`getAiOpenApiPaths()`**.

| Area                      | Routes (representative)                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                    | `GET /ai/status`                                                                                                                                                     |
| Studio helpers            | `GET /ai/helpers/:projectId`, `GET /ai/settings/:projectId`                                                                                                          |
| Assist (suggestions only) | `POST /ai/write`, `POST /ai/translate/field`, `POST /ai/analyse/image`                                                                                               |
| Generate                  | `POST /ai/generate/entry`, `POST /ai/generate/fields`, `POST /ai/generate-image`, `POST /ai/generate-audio`, `POST /ai/generate-3d`, `POST /ai/save-generated-image` |
| Translate entry           | `POST /ai/translate/entry` (sub-router)                                                                                                                              |

Assist routes enforce **`project.ai.helpers`** and **`project.ai.roles`** via `assertHelper()` — see [`src/helpers.ts`](src/helpers.ts).

## Main exports

| Export                                                                                   | Use                                 |
| ---------------------------------------------------------------------------------------- | ----------------------------------- |
| `getAdapter`, `setAdapter`, `initAiFromEnv`                                              | Global text adapter lifecycle       |
| `getCredits`, `deductCredits`, `getCreditCost`                                           | Per-project credit stub             |
| `helperState`, `helperStates`, `assertHelper`                                            | Project helper gating               |
| `runWritingAction`, `translateField`, `translateEntry`, `analyseImage`, `generateImages` | Core operations (tests, extensions) |
| `createAiRouter`, `getAiOpenApiPaths`                                                    | API composition                     |
| `registerAIProvider`, `getAIProviderFactory`                                             | Optional provider registration      |

Types: `MoteurAIAdapter`, `WritingAction`, `AIError`, etc. from `./types.js`.

## Client

TypeScript callers should use **`@moteurio/client`** `client.ai.*` ([`packages/client/src/admin/ai.ts`](../client/src/admin/ai.ts)) over HTTP, not this package, unless you are extending the server.

## Tests

```bash
pnpm --filter @moteurio/ai test
```

Route integration tests live under `packages/api/tests/ai/`.

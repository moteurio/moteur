# Moteur AI

This document describes the AI layer in Moteur: configuration, providers, credits, and all AI-related API endpoints and Studio features.

---

## Overview

Moteur uses a **provider-agnostic AI layer** implemented in the `@moteurio/ai` package. The API and Studio consume this layer for:

- **Text generation** — draft, rewrite, shorten, expand, tone adjustment, summarise-excerpt (AI Writing)
- **Translation** — single-field, block arrays, and whole-entry translation for multilingual content
- **Entry generation** — generate a full entry from a prompt and model schema
- **Field generation** — generate field definitions from a prompt (operator)
- **Image generation** — generate images from a text prompt (when the provider supports it)

All AI operations (except operator-only field generation) use a **project-level credit system**. Credits are deducted before each call; when the balance is insufficient, the API returns `402 Payment Required` with `error: 'insufficient_credits'`.

---

## Package: @moteurio/ai

The core AI logic lives in **`packages/ai`** and is published as **`@moteurio/ai`**. It provides:

| Export               | Description                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Types**            | `MoteurAIAdapter`, `MoteurAIContext`, `CreditBalance`, `GenerateOptions`, `ImageGenerateOptions`, `ImageResult`                                                                                      |
| **Adapter**          | `getAdapter()`, `setAdapter(adapter)` — returns the configured LLM adapter or `null`                                                                                                                 |
| **Image adapter**    | `getImageAdapter(projectSettings)` — returns adapter for image generation from project’s `ai.imageProvider` (openai, fal, replicate); throws `AIError('image_provider_not_configured')` when not set |
| **Factory**          | `getAdapterFromEnv()`, `clearAdapterCache()` — build adapter from env (for advanced use)                                                                                                             |
| **Credits**          | `getCredits(projectId)`, `deductCredits(projectId, amount)`, `setCredits(projectId, amount)`                                                                                                         |
| **Image generation** | `generateImages(request, context, projectSettings)` — prompt assembly, 10-credit deduction, provider call; throws `AIError('insufficient_credits')` or `AIError('image_provider_not_configured')`    |
| **Errors**           | `AIError`, `NotImplementedError` (e.g. Anthropic/fal/replicate stubs)                                                                                                                                |
| **Mock**             | `MockAdapter` — deterministic implementation for tests (no network)                                                                                                                                  |

The **API** (`@moteurio/api`) depends on `@moteurio/ai` and uses it for all AI routes. The API re-exports `getAdapter`, `setAdapter`, and the credit helpers so existing tests and callers can keep using the same imports; types are imported from `@moteurio/ai`.

---

## Configuration

### Environment variables

| Variable                         | Description                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`MOTEUR_AI_PROVIDER`**         | Provider to use: `openai`, `anthropic`, or `mock`. **Required** for AI to be enabled. When unset, AI is disabled (API returns 503, Studio hides AI features). |
| **`OPENAI_API_KEY`**             | OpenAI API key. Used when `MOTEUR_AI_PROVIDER=openai`.                                                                                                        |
| **`ANTHROPIC_API_KEY`**          | Anthropic API key. Used when `MOTEUR_AI_PROVIDER=anthropic`.                                                                                                  |
| **`MOTEUR_AI_CREDIT_COSTS`**     | Optional. JSON object overriding default credit costs per operation (see Credits). Example: `{"write.draft":3,"translate.entry":8}`.                          |
| **`MOTEUR_AI_CREDITS_DISABLED`** | Set to `1` or `true` to disable credit checks and deductions (unlimited AI). Use until persistent credits exist.                                              |

**Behaviour:**

- If **`MOTEUR_AI_PROVIDER`** is set: the adapter is created from that provider. Missing or invalid config yields `getAdapter()` returning `null` (API responds with 503 for AI endpoints).
- If **`MOTEUR_AI_PROVIDER`** is not set: AI is **disabled**. `getAdapter()` returns `null`; API returns 503 for AI calls; Studio does not show AI buttons or options.

For a full list of env vars, see [Configuration](Configuration.md). An **AI** subsection there references these variables.

---

## Providers

### OpenAI (`openai`)

- **Models:** `gpt-4o` (text, structured, image analysis), `text-embedding-3-small` (embeddings), `dall-e-3` (image generation).
- **Requires:** `OPENAI_API_KEY` when `MOTEUR_AI_PROVIDER=openai`.
- **Capabilities:** `generate`, `generateStructured`, `embed`, `analyseImage`, `generateImage`.

### Anthropic (`anthropic`)

- **Model:** `claude-sonnet-4-20250514`.
- **Requires:** `ANTHROPIC_API_KEY` when `MOTEUR_AI_PROVIDER=anthropic`.
- **Capabilities:** `generate`, `generateStructured`, `analyseImage`. `embed` and `generateImage` are not supported (API returns 503 for image generation if only Anthropic is configured).

### Mock (`mock`)

- **Use:** Tests and development. No network calls; deterministic responses (e.g. `[mock:N chars]` for text).
- **Requires:** `MOTEUR_AI_PROVIDER=mock` (no API key needed).

---

## Credits

Credits are **per project**. The current implementation is an **in-memory stub** (default 1000 per project); replace with a persistent store (e.g. database) for production.

Set **`MOTEUR_AI_CREDITS_DISABLED=1`** to turn off balance checks and deductions entirely (responses still include `creditsRemaining`, fixed at 1_000_000).

**Costs are configurable** via the `MOTEUR_AI_CREDIT_COSTS` environment variable (JSON object). Unset keys use the defaults below.

| Operation key                                                               | Default cost                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| `write.draft`                                                               | 2                                              |
| `write.draft_long`                                                          | 5                                              |
| `write.rewrite`, `write.shorten`, `write.expand`, `write.summarise_excerpt` | 2                                              |
| `write.tone`                                                                | 1                                              |
| `translate.field`                                                           | 1                                              |
| `translate.rich_text`                                                       | 2                                              |
| `translate.entry`                                                           | 5 (upfront; field calls inside skip deduction) |
| `translate.block`                                                           | 2                                              |
| `generate.entry`                                                            | 5                                              |
| `analyse.image`                                                             | 2                                              |
| `generate.image`                                                            | 10                                             |

When credits are insufficient, the API returns **402** with body `{ error: 'insufficient_credits', creditsRemaining?: number, message?: string }` (shape varies by endpoint).

---

## API endpoints

All AI endpoints are mounted under the API base path (e.g. `/ai` or `{API_BASE_PATH}/ai`). When no AI provider is configured, these endpoints return **503** (Studio uses `GET /ai/status` to hide AI UI). Auth and project access follow the same rules as the rest of the API.

### GET /ai/status

**Auth:** JWT (`requireAuth`).

**Response (200):** `{ enabled: boolean }`. Used by Studio to show or hide AI buttons and options.

---

### AI audit (separate from content activity)

Persisted under **`.moteur/ai-audit.json`** per project (workspace file, not main content git).

| Method + path                                      | Description                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GET** `/projects/{projectId}/ai-audit`           | JWT + project access. Paginated **summaries** only (`limit`, `before` — same idea as activity). Fields: `action`, `provider`, `creditsUsed`, `creditsRemainingAfter`, `success`, `modelId`, `locale`, timestamps, etc. **No** full prompts. |
| **GET** `/projects/{projectId}/ai-audit/{eventId}` | Same access. **Platform admin** JWT (`admin` role) receives the full row including `systemPrompt`, `userPrompt`, and `response`. Other project members receive the **summary** shape only.                                                  |

`generate.entry` is logged today; extend logging to other AI routes as needed.

---

### Write (per-action endpoints)

**Auth:** Project access (JWT + project context). **Body** (common): `projectId`, `modelId`, `entryId?`, `fieldPath`, `locale`, and action-specific fields (`currentValue?`, `bodyValueForExcerpt?`, `currentEntryData?`, `graceRegenerate?`).

| Method + path                        | Description                     |
| ------------------------------------ | ------------------------------- |
| POST `/ai/write/draft`               | Generate a draft for the field. |
| POST `/ai/write/rewrite`             | Rewrite existing content.       |
| POST `/ai/write/shorten`             | Shorten content.                |
| POST `/ai/write/expand`              | Expand content.                 |
| POST `/ai/write/tone/formal`         | Apply formal tone.              |
| POST `/ai/write/tone/conversational` | Apply conversational tone.      |
| POST `/ai/write/tone/editorial`      | Apply editorial tone.           |
| POST `/ai/write/summarise-excerpt`   | Generate excerpt from body.     |

**Response (200):** `{ value, creditsUsed, creditsRemaining }`. On insufficient credits: **402**.

---

### POST /ai/translate/field

**Auth:** Project access.

**Body:** `projectId`, `modelId`, `entryId`, `fieldPath`, `fromLocale`, `toLocale`.

**Response (200):** `{ value, creditsUsed, creditsRemaining }`. **400** if field not found or not multilingual. **402** if insufficient credits.

---

### POST /ai/translate/entry

**Auth:** Project access.

**Body:** `projectId`, `modelId`, `entryId`, `fromLocale`, `toLocales` (array).

**Response (200):** `{ fields, creditsUsed, creditsRemaining }`. `fields` is `Record<fieldPath, Record<locale, value>>`. **402** if insufficient credits.

---

### POST /ai/generate/entry

**Auth:** Project access.

**Body:** `prompt`, `projectId`, `modelId`, `locale?` (default `en`).

**Response (200):** `{ success: true, entry, creditsUsed, creditsRemaining }`. **402** if insufficient credits. **503** if no AI provider is configured.

---

### POST /ai/generate/fields

**Auth:** JWT with **operator** role (see [Authentication](Authentication.md)).

**Body:** `prompt`, `currentFields` (object of existing field definitions).

**Response (200):** `{ fields }` (merged with `currentFields`). **503** if no AI provider is configured. This endpoint does not use the project credit system.

---

### POST /ai/generate-image

**Auth:** JWT (requireAuth). Project access required (projectId in body).

**Body:** `prompt`, `styleHints?` (array: photographic, illustration, technical-diagram, editorial, abstract), `aspectRatio?` (`1:1`, `4:3`, `16:9`, `3:2`), `count?` (1–2, default 2), `projectId`, `entryId?`, `source?` (`field` \| `brief` \| `library`).

**Response (200):** `{ variants: [{ url, width, height }], prompt, creditsUsed, creditsRemaining }`. **402** when insufficient credits (`error: 'insufficient_credits'`, `creditsRemaining`). **422** when `error: 'image_provider_not_configured'` (project has no `ai.imageProvider` or key missing). **503** when the selected provider does not implement `generateImage` (e.g. fal/replicate stubs). Uses project’s **image provider** (Settings → AI); 10 credits per call.

### POST /ai/save-generated-image

**Auth:** JWT (requireAuth). Project access required.

**Body:** `variantUrl` (temporary provider URL), `prompt`, `provider` (e.g. `openai/dall-e-3`), `aspectRatio`, `projectId`, `entryId?`, `fieldPath?`.

**Response (200):** `{ asset }` — the saved media asset with `generationPrompt`, `aiProvider`, `aiGenerated: true`. The image is fetched from the provider URL and stored in the project’s media storage.

### POST /ai/generate/image (legacy)

**Auth:** JWT. Uses global `getAdapter()` (no project image provider). **Body:** `prompt`, `size?`, `quality?`. **Response (200):** `{ image, width, height, prompt }`. Prefer **POST /ai/generate-image** for Studio (project-scoped, credits, style hints).

---

### POST /ai/analyse/image

**Auth:** JWT (`requireAuth`). Project access is checked when `projectId` is in the body.

**Body:** `assetUrl`, `locale`, `projectId`, and optionally `modelId`, `entryId`, `fieldPath`, `modelLabel`, `entryTitle`, `categoryName`. When `entryId` and `fieldPath` are provided, the server joins the entry's presence room, acquires field-level locks on `fieldPath.alt` and `fieldPath.caption`, writes the analysis result into the entry, then releases locks and broadcasts to the room.

**Response (200):** `{ alt, caption, creditsUsed, creditsRemaining }`. Optionally `skippedFields` (when a lock was denied) and `written`. **402** when insufficient credits (`error: 'insufficient_credits'`, `creditsRemaining`). **503** when no AI provider or provider does not support `analyseImage`.

---

## Studio integration

- **AI Writing:** Floating panel (✦ AI) on text, textarea, and rich-text fields in the entry editor. Offers draft, rewrite, shorten, expand, tone, and summarise-excerpt. Uses `POST /ai/write/draft`, `POST /ai/write/rewrite`, etc.; first regeneration in a session can be free (`graceRegenerate`).
- **Translate field:** ✦ Translate button on multilingual text, textarea, and rich-text fields. Translates from the default locale to the chosen target; uses `POST /ai/translate/field`.
- **Translate entry:** “✦ Translate entry” in the create-entry wizard. Opens a modal; calls `POST /ai/translate/entry`, then shows a diff and lets the user apply selected field translations into the form.
- **Image analysis:** On `core/image` fields, **✦ Analyse** (when alt/caption are empty) and **✦ Re-analyse** (when both filled) call `POST /ai/analyse/image`. Supports array paths (e.g. `images[0]`) for gallery/asset-list. The AI participates in the entry presence room: it acquires field-level locks on the alt/caption sub-fields, writes values, then releases. Lock contention returns `skippedFields`.
- **Image generation:** **✦ Generate** in empty `core/image` fields, media library toolbar, and (when subject is set) demo/illustration-brief block. Opens a panel with prompt, style toggles, aspect ratio; calls `POST /ai/generate-image` (10 credits), then **Select** calls `POST /ai/save-generated-image` to store the chosen variant. Project must have an **image provider** set in Settings → AI (OpenAI, fal.ai, Replicate). First use per project shows a licensing acknowledgement modal; state stored in `project.ai.imageGenerationAcknowledged`.
- **Auto image analysis:** When `project.ai.autoAnalyseImages` is enabled, uploads in the media library trigger analysis and store alt/caption on the asset. Optional one-time toast in Studio.

---

## Architecture summary (review)

- **Two adapter paths:** **Text/analysis/translation** use `getAdapter()` (env: `MOTEUR_AI_PROVIDER` = openai \| anthropic \| mock). **Image generation** uses `getImageAdapter(project.ai)` (project setting: `ai.imageProvider` = openai \| fal \| replicate). So the global provider can be Anthropic for writing while a project uses OpenAI for images.
- **Credits:** In-memory per project (default 1000). Deducted before each operation; 402 when insufficient. Costs in `creditCosts.ts`; overridable via `MOTEUR_AI_CREDIT_COSTS`.
- **Project AI settings** (`project.ai`): `autoAnalyseImages`, `imageProvider`, `imageGenerationAcknowledged`. Stored in project JSON; Studio Configuration → AI.
- **402 response shape:** Endpoints use either `creditsRemaining` (analyse/image, generate-image) or `message` (write, translate, generate/entry). Consider standardising on `{ error: 'insufficient_credits', creditsRemaining }` for all.
- **GET /ai/status:** Reflects only `getAdapter()` (global text provider). Studio uses it to show/hide AI UI; image generation is additionally gated by `project.ai.imageProvider` in the UI.
- **Legacy:** `POST /ai/generate/image` (under `/generate`) still exists; uses global adapter, no project credits. Prefer `POST /ai/generate-image` and `POST /ai/save-generated-image` for new flows.

---

## See also

- [REST API](REST%20API.md) — Full HTTP API reference (including AI endpoints).
- [Configuration](Configuration.md) — All environment variables, including AI.

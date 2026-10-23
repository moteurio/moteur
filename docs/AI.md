# Moteur AI

This document describes the AI layer in Moteur: configuration, providers, credits, and all AI-related API endpoints and Studio features.

---

## Overview

Moteur uses a **provider-agnostic AI layer** implemented in **`@moteurio/plugin-ai`** (private host plugin). The API and Studio consume this layer for:

- **Text generation** — draft, rewrite, shorten, expand, tone adjustment, summarise-excerpt (AI Writing)
- **Translation** — single-field, block arrays, and whole-entry translation for multilingual content
- **Entry generation** — generate a full entry from a prompt and model schema
- **Field generation** — generate field definitions from a prompt (operator)
- **Image generation** — generate images from a text prompt (when the provider supports it)

All AI operations (except operator-only field generation) use a **project-level credit system**. Credits are deducted before each call; when the balance is insufficient, the API returns `402 Payment Required` with `error: 'insufficient_credits'`.

**Per-project helpers:** Each capability (`write`, `translate`, `alt`, `notes`, `images`) must be turned on in `project.ai.helpers` and is limited to roles listed in `project.ai.roles` (see `GET /ai/helpers/:projectId`). Set `project.ai.enabled: false` to disable AI for a project entirely.

---

## Package: @moteurio/plugin-ai

The core AI logic and host plugin (`id: ai`) live in **`moteur-plugins-extra`** as a single private tarball. Provider plugins register factories via **`registerAIProvider`** imported from the same package. It provides:

| Export               | Description                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Types**            | `MoteurAIAdapter`, `MoteurAIContext`, `CreditBalance`, `GenerateOptions`, `ImageGenerateOptions`, `ImageResult`                                                                                              |
| **Adapter**          | `getAdapter()`, `setAdapter(adapter)` — returns the configured LLM adapter or `null`                                                                                                                         |
| **Image adapter**    | `getImageAdapter(projectSettings)` — returns adapter for image generation from project’s `ai.imageProvider` (openai, google, fal, replicate); throws `AIError('image_provider_not_configured')` when not set |
| **Factory**          | `getAdapterFromEnv()`, `clearAdapterCache()` — build adapter from env (for advanced use)                                                                                                                     |
| **Credits**          | `getCredits(projectId)`, `deductCredits(projectId, amount)`, `setCredits(projectId, amount)`                                                                                                                 |
| **Image generation** | `generateImages(request, context, projectSettings)` — prompt assembly, 10-credit deduction, provider call; throws `AIError('insufficient_credits')` or `AIError('image_provider_not_configured')`            |
| **Errors**           | `AIError`, `NotImplementedError` (e.g. Anthropic/fal/replicate stubs)                                                                                                                                        |
| **Mock**             | `MockAdapter` — deterministic implementation for tests (no network)                                                                                                                                          |

The **API** (`@moteurio/api`) does not bundle AI: hosts load **`plugin-ai`** (and **`ai-provider-*`** plugins) from **`moteur-plugins-extra`**. Self-hosted deployments without those plugins have no `/ai` routes. Credits and plan allowances still use **`@moteurio/core`** metering; billing plugins can call `setCreditAllowance`.

---

## Configuration

### Environment variables

| Variable                         | Description                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`MOTEUR_AI_PROVIDER`**         | Provider to use: `openai`, `anthropic`, or `mock`. **Required** for AI to be enabled. When unset, AI is disabled (API returns 503, Studio hides AI features). |
| **`OPENAI_API_KEY`**             | OpenAI API key. Used when `MOTEUR_AI_PROVIDER=openai`.                                                                                                        |
| **`ANTHROPIC_API_KEY`**          | Anthropic API key. Used when `MOTEUR_AI_PROVIDER=anthropic`.                                                                                                  |
| **`MOTEUR_AI_CREDIT_COSTS`**     | Optional. JSON object overriding default credit costs per operation (see Credits). Example: `{"write.draft":3,"translate.entry":8}`.                          |
| **`MOTEUR_AI_CREDITS_DISABLED`** | Set to `1` or `true` to disable credit checks and deductions (unlimited AI).                                                                                  |
| **`MOTEUR_AI_MONTHLY_CREDITS`**  | Credits each project gets per calendar month (default `1000`, or `unlimited`), unless a host plugin sets allowances.                                          |
| **`MOTEUR_METERING_DIR`**        | Where the API server keeps credits and request counts (default `data/metering` under `DATA_ROOT`).                                                            |

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

Credits are **per project and per calendar month (UTC)**. Each project gets a monthly allowance and starts again on the 1st; unused credits don't carry over.

- **Allowance:** `MOTEUR_AI_MONTHLY_CREDITS` (default `1000`, or `unlimited`). A host plugin can decide it per project instead, e.g. a billing plugin by plan: `ctx.setCreditAllowance(projectId => credits | null)` in its `init` (null is unlimited).
- **Ledger:** every spend (with what it was for: `write`, `translate.entry`, `image.generate`…) and every grant is recorded. `ctx.grantCredits(projectId, amount, { reason })` adds to this month (a top-up; negative takes back).
- **Storage:** the API server keeps them in `data/metering` (`MOTEUR_METERING_DIR` to move it): `credits-YYYY-MM.jsonl` is appended on every spend, so nothing is lost on a restart; `requests-YYYY-MM.json` holds the month's public API request counts. One API process per directory; for several, a host plugin can call `setMeteringStore()` from `@moteurio/core/metering` with a shared store (a database). Library and CLI use keep them in memory.
- **Usage:** `GET /projects/{projectId}/usage` (Admin or Billing role) returns this month's public requests, seats (`people`), and credits (allowance, used, granted, remaining, what they went on), and the last 6 months. The Studio shows it under Setup › Billing.

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

When credits are insufficient, the API returns **402** with body `{ error: 'insufficient_credits', creditsRemaining?: number, message?: string }` (shape varies by endpoint). `@moteurio/client` exposes it as `err.code === 'insufficient_credits'`. The Studio explains it wherever it happens and offers the plans to whoever handles billing.

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

### GET /ai/helpers/:projectId

**Auth:** JWT + project access.

**Response (200):** Whether text AI is ready, per-helper availability for the signed-in user (`ok` \| `off` \| `role`), credit balance, and cost table. Helpers: `write`, `translate`, `alt`, `notes`, `images`. A helper is **`off`** until the project sets `project.ai.helpers.<name>: true` and **`role`** when the user’s project roles are not in `project.ai.roles` (default: admin and writer; translators may always use `translate`).

---

### POST /ai/write

**Auth:** Project access. Helper **`write`** must be enabled for the project and allowed for the user.

**Body:** `projectId`, `action` (`draft` \| `rewrite` \| `shorten` \| `expand` \| `tone:formal` \| `tone:conversational` \| `tone:editorial` \| `summarise-excerpt`), `field` (`key`, optional `label`, `type`), optional `value`, `body` (for summarise-excerpt), `locale`, `modelId`, `entryId`.

**Response (200):** `{ text, creditsUsed, creditsRemaining }`. **402** insufficient credits; **403** helper off or wrong role (`AI_HELPER_OFF` / `AI_HELPER_ROLE`).

---

### POST /ai/translate/field

**Auth:** Project access. Helper **`translate`**.

**Body:** `projectId`, `value` (source text), `from`, `to`, optional `field` (`key`, `type`), `modelId`, `entryId`.

**Response (200):** `{ text, creditsUsed, creditsRemaining }`. **402** if insufficient credits.

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

### POST /ai/generate-audio

**Auth:** JWT. Requires project helper `audio` and `project.ai.audioProvider` (`elevenlabs` or `fal`).

**Body:** `prompt`, `voice?` (ElevenLabs voice id or fal voice name), `projectId`, `entryId?`, `fieldPath?`.

**Response (200):** `{ variants: [{ audioBase64, mimeType }], prompt, creditsUsed, creditsRemaining }`. **422** when `audio_provider_not_configured`. Default cost: 5 credits.

### POST /ai/generate-3d

**Auth:** JWT. Requires project helper `model3d` and `project.ai.model3dProvider` (`meshy` or `fal`).

**Body:** `prompt` (max 800 chars), `textured?` (default true), `format?` (`glb` \| `fbx` \| `obj` \| `usdz`), `projectId`, `entryId?`, `fieldPath?`.

**Response (200):** `{ variants: [{ url, format, thumbnailUrl? }], prompt, creditsUsed, creditsRemaining }`. **422** when `model3d_provider_not_configured`. Default cost: 25 credits. Meshy runs asynchronously server-side (preview + refine when textured).

### POST /ai/save-generated-image

**Auth:** JWT (requireAuth). Project access required.

**Body:** `variantUrl` (temporary provider URL), `prompt`, `provider` (e.g. `openai/dall-e-3`), `aspectRatio`, `projectId`, `entryId?`, `fieldPath?`.

**Response (200):** `{ asset }` — the saved media asset with `generationPrompt`, `aiProvider`, `aiGenerated: true`. The image is fetched from the provider URL and stored in the project’s media storage.

### POST /ai/generate/image (legacy)

**Auth:** JWT. Uses global `getAdapter()` (no project image provider). **Body:** `prompt`, `size?`, `quality?`. **Response (200):** `{ image, width, height, prompt }`. Prefer **POST /ai/generate-image** for Studio (project-scoped, credits, style hints).

---

### GET /ai/settings/:projectId

**Auth:** JWT + project access.

**Response (200):** `{ textAi: { enabled, provider }, credits: { remaining, unlimited } }` — global text provider from env plus this project’s credit balance (Studio settings overview).

---

### POST /ai/analyse/image

**Auth:** JWT + project access. Helper **`alt`**.

**Body:** `projectId`, `assetId`, optional `locale`, `otherAlt` (context for caption).

**Response (200):** `{ alt, caption, creditsUsed, creditsRemaining }`. Suggestions only; nothing is written to entries or assets by this route. **402** when insufficient credits. **503** when no AI provider or provider does not support `analyseImage`.

---

## Studio integration

- **AI Writing:** Floating panel (✦ AI) on text, textarea, and rich-text fields. Calls **`POST /ai/write`** with an `action` and field metadata; Studio applies the returned `text` locally.
- **Translate field:** ✦ Translate on multilingual fields. Uses **`POST /ai/translate/field`** with `value`, `from`, and `to`.
- **Translate entry:** “✦ Translate entry” in the create-entry wizard. Opens a modal; calls `POST /ai/translate/entry`, then shows a diff and lets the user apply selected field translations into the form.
- **Image analysis:** **✦ Analyse** / **✦ Re-analyse** call **`POST /ai/analyse/image`** with `assetId`; Studio fills alt/caption from the response.
- **Image generation:** **✦ Generate** in empty `core/image` fields, media library toolbar, and (when subject is set) demo/illustration-brief block. Opens a panel with prompt, style toggles, aspect ratio; calls `POST /ai/generate-image` (10 credits), then **Select** calls `POST /ai/save-generated-image` to store the chosen variant. Project must have an **image provider** set in Settings → AI (OpenAI, Google Gemini, fal.ai, Replicate). First use per project shows a licensing acknowledgement modal; state stored in `project.ai.imageGenerationAcknowledged`.
- **Auto image analysis:** When `project.ai.autoAnalyseImages` is enabled, uploads in the media library trigger analysis and store alt/caption on the asset. Optional one-time toast in Studio.

---

## Architecture summary (review)

- **Adapter paths:** **Text/analysis/translation** use `getAdapter()` (env: `MOTEUR_AI_PROVIDER` = openai \| anthropic \| google \| fal \| mock). **Image generation** uses `getImageAdapter(project.ai)` (`ai.imageProvider` = openai \| google \| fal \| replicate). **Audio** uses `getAudioAdapter(project.ai)` (`ai.audioProvider` = elevenlabs \| fal). **3D models** use `getModel3dAdapter(project.ai)` (`ai.model3dProvider` = meshy \| fal). Global and per-media providers can differ (e.g. Anthropic for writing, Google for images, Meshy for 3D).
- **Credits:** Monthly allowance per project, kept in a ledger (see Credits). Deducted before each operation; 402 when insufficient. Costs in `creditCosts.ts`; overridable via `MOTEUR_AI_CREDIT_COSTS`.
- **Project AI settings** (`project.ai`): `autoAnalyseImages`, `imageProvider`, `audioProvider`, `model3dProvider`, `imageGenerationAcknowledged`, and per-helper toggles (`helpers.audio`, `helpers.model3d`, …). Stored in project JSON; Studio Configuration → AI.
- **402 response shape:** Endpoints use either `creditsRemaining` (analyse/image, generate-image) or `message` (write, translate, generate/entry). Consider standardising on `{ error: 'insufficient_credits', creditsRemaining }` for all.
- **GET /ai/status:** Reflects only `getAdapter()` (global text provider). Studio uses it to show/hide AI UI; image generation is additionally gated by `project.ai.imageProvider` in the UI.
- **Legacy:** `POST /ai/generate/image` (under `/generate`) still exists; uses global adapter, no project credits. Prefer `POST /ai/generate-image` and `POST /ai/save-generated-image` for new flows.

---

## See also

- [REST API](REST%20API.md) — Full HTTP API reference (including AI endpoints).
- [Configuration](Configuration.md) — All environment variables, including AI.

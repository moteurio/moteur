# Fields reference (core)

Fields are the **building blocks** of everything you store in Moteur: **models** (entries), **structures** (reusable shapes), **blocks** (page components), and **page templates**. Each field has a `type` like `core/text` or `core/layout`, plus **`options`** that tune validation and Studio UI.

**Who this is for:** developers defining schemas in JSON/Blueprints or debugging saved content. When in doubt, the source of truth is `packages/core/src/fields/` (one file per type).

**Multilingual:** Many types store **per-locale** values (e.g. `{ "en": "Hello", "fr": "Bonjour" }`). Below, examples often show a single locale for clarity.

**Renamed type:** `core/composition-ref` → **`core/layout`** (same value shape; only the `type` string changed).

---

## How to read each field section

- **What it does / when to use it** — mental model for juniors.
- **Stored value** — what appears under the field key in entry/page JSON (unless noted).
- **Options** — every key from `optionsSchema` in the registry: **you set these on the field definition**, not inside the saved value.
- **Examples** — a minimal field definition and a realistic saved value.

Field definitions (simplified) look like:

```json
{
    "key": "myField",
    "type": "core/text",
    "label": "My field",
    "required": true,
    "options": { "maxLength": 200 }
}
```

---

## Glossary: Layout resource vs `core/layout` vs `core/block-list`

| Term                          | Meaning                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| **Layout (resource)**         | File under `layouts/`: ordered `blocks[]` with types. API + `validateLayout`.          |
| **`core/layout` (field)**     | Points at a Layout resource by id; editors fill **slot `data` only** (preset regions). |
| **`core/block-list` (field)** | **Block canvas:** freeform `Block[]` on the page/entry.                                |

Say **Layout resource** when you mean the JSON file, to avoid confusion with the field type **`core/layout`**.

---

## Quick index

Anchors follow common Markdown slug rules (`core/foo` → `#core-foo`). If a viewer breaks links, search for `## core/…`.

**Text:** [core/html](#core-html) · [core/markdown](#core-markdown) · [core/rich-text](#core-rich-text) · [core/text](#core-text) · [core/textarea](#core-textarea)

**Number & choices:** [core/boolean](#core-boolean) · [core/multi-select](#core-multi-select) · [core/number](#core-number) · [core/select](#core-select)

**Date & time:** [core/date](#core-date) · [core/datetime](#core-datetime) · [core/time](#core-time)

**Media:** [core/model-3d](#core-model-3d) · [core/asset](#core-asset) · [core/asset-list](#core-asset-list) · [core/image](#core-image) · [core/media-image](#core-media-image) · [core/video](#core-video)

**Links & contact:** [core/email](#core-email) · [core/link](#core-link) · [core/phone](#core-phone) · [core/slug](#core-slug) · [core/url](#core-url)

**Structured data:** [core/json](#core-json) · [core/list](#core-list) · [core/object](#core-object) · [core/structure](#core-structure) · [core/table](#core-table) · [core/layout](#core-layout) · [core/block-list](#core-block-list)

**Relations:** [core/categories](#core-categories) · [core/relation](#core-relation) · [core/relations](#core-relations) · [core/tags](#core-tags)

**System:** [core/address](#core-address) · [core/color](#core-color) · [core/icon](#core-icon) · [core/id](#core-id) · [core/order](#core-order) · [core/status](#core-status)

---

## Summary tables (picker order)

Studio groups types like `fieldTypes.tsx`. **core/media-image** is documented here but not in the picker—prefer **core/image**.

### Text

| Type           | One-line                             |
| -------------- | ------------------------------------ |
| core/html      | Raw HTML per locale                  |
| core/markdown  | CommonMark string per locale         |
| core/rich-text | DAST JSON per locale (WYSIWYG)       |
| core/text      | Short string per locale              |
| core/textarea  | Long text, same shape as `core/text` |

### Number & choices

| Type              | One-line                         |
| ----------------- | -------------------------------- |
| core/boolean      | true / false                     |
| core/multi-select | Several values from a fixed list |
| core/number       | Integer or decimal               |
| core/select       | One value from a fixed list      |

### Date & time

| Type          | One-line                   |
| ------------- | -------------------------- |
| core/date     | Calendar date `YYYY-MM-DD` |
| core/datetime | ISO 8601 date-time         |
| core/time     | Time `HH:MM`               |

### Media

| Type             | One-line                                   |
| ---------------- | ------------------------------------------ |
| core/model-3d    | glTF / poster / USDZ refs                  |
| core/asset       | One project asset + alt/caption            |
| core/asset-list  | Ordered list of assets                     |
| core/image       | Full image field (uses media-image inside) |
| core/media-image | Low-level URL/path only                    |
| core/video       | Provider + video id + metadata             |

### Links & contact

| Type       | One-line                              |
| ---------- | ------------------------------------- |
| core/email | Validated email string                |
| core/link  | URL + label + a11y + behavior flags   |
| core/phone | Plain string (no strict format)       |
| core/slug  | URL segment(s), often auto from title |
| core/url   | URL string per locale                 |

### Structured data

| Type            | One-line                                  |
| --------------- | ----------------------------------------- |
| core/json       | Any JSON (+ optional JSON Schema)         |
| core/list       | Repeater with item schema                 |
| core/object     | Bag of nested fields you define           |
| core/structure  | Object validated by shared structure      |
| core/table      | 2D grid + optional titles / source link   |
| core/layout     | `layoutId` + slot payloads vs Layout file |
| core/block-list | Freeform `Block[]`                        |

### Relations

| Type            | One-line                     |
| --------------- | ---------------------------- |
| core/categories | Category ids from a taxonomy |
| core/relation   | One linked entry             |
| core/relations  | Many linked entries          |
| core/tags       | Tag ids from a tag source    |

### System

| Type         | One-line               |
| ------------ | ---------------------- |
| core/address | Postal address parts   |
| core/color   | Hex (+ optional alpha) |
| core/icon    | Icon id string         |
| core/id      | UUID (system-owned)    |
| core/order   | Sort integer           |
| core/status  | Workflow enum          |

---

## Field types (full reference)

---

## core/html

**Category:** Text · **Source:** `packages/core/src/fields/core/html.ts`

**What it does:** Stores **raw HTML** as text. The engine does not sanitize unless you add your own pipeline—treat it as trusted or sanitize on render.

**When to use it:** Legacy migrations, embeds, or when you must preserve HTML exactly. Prefer **core/markdown** or **core/rich-text** for new editorial content.

**Stored value:** Object with a multilingual `html` key (shape follows your API; often nested field keys per type).

| Option        | Type | Default | Description                                                        |
| ------------- | ---- | ------- | ------------------------------------------------------------------ |
| `allowedTags` | list | —       | Optional allowlist of HTML tags for future tooling / Studio hints. |
| `ui`          | text | —       | Studio-only hint for how to render the editor.                     |

**Field example**

```json
{
    "key": "bodyLegacy",
    "type": "core/html",
    "label": "HTML body",
    "options": { "ui": "code" }
}
```

**Value example**

```json
{
    "en": "<p>Hello <strong>world</strong></p>"
}
```

---

## core/markdown

**Category:** Text · **Source:** `packages/core/src/fields/core/markdown.ts`

**What it does:** Stores **CommonMark** markdown per locale. Front-ends typically convert to HTML when rendering.

**When to use it:** Docs, simple articles, comments—when you want plain text with lightweight formatting without a full WYSIWYG tree.

**Stored value:** Multilingual markdown string under the field’s logical shape (e.g. `markdown` subkey depending on normalization).

| Option        | Type    | Default | Description                                                                        |
| ------------- | ------- | ------- | ---------------------------------------------------------------------------------- |
| `allowHTML`   | boolean | `false` | If true, raw HTML inside markdown may be allowed (policy depends on the frontend). |
| `placeholder` | text    | —       | Empty-state hint in Studio.                                                        |
| `ui`          | text    | —       | Studio-only editor hint.                                                           |

**Field example**

```json
{
    "key": "intro",
    "type": "core/markdown",
    "label": "Introduction",
    "options": { "placeholder": "Write markdown…" }
}
```

**Value example**

```json
{
    "en": "## Title\n\nSome **bold** text."
}
```

---

## core/rich-text

**Category:** Text · **Source:** `packages/core/src/fields/core/rich-text.ts`

**What it does:** Stores **structured rich text** as **DAST** (JSON tree), not a plain string. Studio WYSIWYG maps to this.

**When to use it:** Marketing copy, articles, any rich formatting where you need a stable AST (custom frontend components, mobile, etc.).

**Stored value:** DAST document per locale under `dast` (or equivalent nested key).

| Option       | Type    | Default | Description                                   |
| ------------ | ------- | ------- | --------------------------------------------- |
| `allowEmpty` | boolean | `true`  | If false, empty document may fail validation. |
| `ui`         | text    | —       | Studio-only hint.                             |

**Field example**

```json
{
    "key": "content",
    "type": "core/rich-text",
    "label": "Page content",
    "options": { "allowEmpty": false }
}
```

**Value example** (illustrative DAST fragment)

```json
{
    "en": {
        "type": "root",
        "children": [{ "type": "paragraph", "children": [{ "type": "text", "value": "Hello" }] }]
    }
}
```

---

## core/text

**Category:** Text · **Source:** `packages/core/src/fields/core/text.ts`

**What it does:** Single-line (conceptually) **string per locale**. The workhorse for titles, names, labels.

**When to use it:** Almost any short string. Use **core/textarea** when editors need a larger box (same storage shape).

**Stored value:** Usually `{ "text": { "en": "..." } }` or a normalized locale map depending on API—treat as multilingual string data.

| Option         | Type    | Default      | Description                                                 |
| -------------- | ------- | ------------ | ----------------------------------------------------------- |
| `maxLength`    | number  | `255`        | Hard cap on length.                                         |
| `minLength`    | number  | `1`          | Minimum length when non-empty.                              |
| `allowEmpty`   | boolean | `false`      | If false, empty string is invalid.                          |
| `validation`   | object  | see registry | `pattern` (regex), `message` (error text).                  |
| `placeholder`  | string  | `""`         | Studio placeholder.                                         |
| `autocomplete` | boolean | `false`      | Hint for browser autocomplete.                              |
| `ui`           | text    | —            | Studio hint: `input`, `textarea`, `email`, `password`, etc. |

**Field example**

```json
{
    "key": "title",
    "type": "core/text",
    "label": "Title",
    "required": true,
    "options": { "maxLength": 120, "minLength": 1 }
}
```

**Value example**

```json
{
    "en": "My article",
    "fr": "Mon article"
}
```

---

## core/textarea

**Category:** Text · **Source:** `packages/core/src/fields/core/textarea.ts`

**What it does:** Same **value shape and validation** as **core/text**, but signals Studio to show a **multiline** control.

**When to use it:** Descriptions, bios, long plain text **without** markdown or WYSIWYG.

| Option        | Type    | Default | Description                    |
| ------------- | ------- | ------- | ------------------------------ |
| `maxLength`   | number  | `65535` | Max length.                    |
| `minLength`   | number  | `0`     | Min length.                    |
| `allowEmpty`  | boolean | `true`  | Allow empty content.           |
| `placeholder` | text    | `""`    | Studio placeholder.            |
| `ui`          | text    | —       | Studio hint (e.g. `textarea`). |

**Field example**

```json
{
    "key": "bio",
    "type": "core/textarea",
    "label": "Biography",
    "options": { "maxLength": 2000 }
}
```

**Value example**

```json
{
    "en": "Long plain text…"
}
```

---

## core/boolean

**Category:** Number & choices · **Source:** `packages/core/src/fields/core/boolean.ts`

**What it does:** Stores **true or false**—flags, toggles, “enabled?” questions.

**When to use it:** Binary state. For “pick one of several,” use **core/select**.

| Option       | Type | Default | Description                      |
| ------------ | ---- | ------- | -------------------------------- |
| `trueLabel`  | text | `Yes`   | Label for true in Studio.        |
| `falseLabel` | text | `No`    | Label for false in Studio.       |
| `ui`         | text | —       | Studio hint: toggle vs checkbox. |

**Field example**

```json
{
    "key": "featured",
    "type": "core/boolean",
    "label": "Featured",
    "options": { "trueLabel": "On", "falseLabel": "Off" }
}
```

**Value example**

```json
{ "value": true }
```

---

## core/number

**Category:** Number & choices · **Source:** `packages/core/src/fields/core/number.ts`

**What it does:** Stores a **number** (quantity, price, rating, sort weight).

**When to use it:** Anything numeric with optional min/max/step. For integers used only for **manual ordering**, **core/order** is semantically clearer.

| Option        | Type   | Default | Description                                    |
| ------------- | ------ | ------- | ---------------------------------------------- |
| `min`         | number | `null`  | Minimum allowed value.                         |
| `max`         | number | `null`  | Maximum allowed value.                         |
| `step`        | number | `1`     | Step for inputs / validation granularity.      |
| `placeholder` | string | `""`    | Studio placeholder.                            |
| `ui`          | text   | —       | Studio hint: `input`, `slider`, `rating`, etc. |

**Field example**

```json
{
    "key": "price",
    "type": "core/number",
    "label": "Price (EUR)",
    "options": { "min": 0, "step": 0.01 }
}
```

**Value example**

```json
{ "value": 19.99 }
```

---

## core/select

**Category:** Number & choices · **Source:** `packages/core/src/fields/core/select.ts`

**What it does:** Pick **one** (or optionally many) **values from a list you define** in the schema—like an enum with labels.

**When to use it:** Fixed sets: theme, alignment, country code from a short list. For **multiple** picks from the same list, set `multiple: true` or use **core/multi-select**.

| Option        | Type    | Default      | Description                                                          |
| ------------- | ------- | ------------ | -------------------------------------------------------------------- |
| `choices`     | array   | **required** | Option definitions (value + label; structure per Studio/Blueprints). |
| `allowEmpty`  | boolean | `false`      | Allow no selection.                                                  |
| `multiple`    | boolean | `false`      | Allow multi-select in one field.                                     |
| `placeholder` | string  | —            | Empty label in Studio.                                               |
| `ui`          | text    | —            | Studio hint: dropdown, radio, button group.                          |

**Field example**

```json
{
    "key": "alignment",
    "type": "core/select",
    "label": "Alignment",
    "required": true,
    "options": {
        "choices": [
            { "value": "left", "label": "Left" },
            { "value": "center", "label": "Center" },
            { "value": "right", "label": "Right" }
        ],
        "ui": "radio"
    }
}
```

**Value example**

```json
{ "en": "center" }
```

---

## core/multi-select

**Category:** Number & choices · **Source:** `packages/core/src/fields/core/multi-select.ts`

**What it does:** Pick **several** values from a **fixed** list; stored as a **string array** (per locale rules).

**When to use it:** Facets, feature flags, “which departments?”—not free-form tags (use **core/tags** if tags live in another model).

| Option        | Type    | Default      | Description                                                 |
| ------------- | ------- | ------------ | ----------------------------------------------------------- |
| `choices`     | array   | **required** | Allowed options.                                            |
| `allowEmpty`  | boolean | `false`      | Allow zero selections.                                      |
| `placeholder` | text    | —            | Studio placeholder.                                         |
| `ui`          | text    | —            | Studio hint: checkboxes, multi-dropdown, `tag` for chip UI. |

**Field example**

```json
{
    "key": "channels",
    "type": "core/multi-select",
    "label": "Channels",
    "options": {
        "choices": [
            { "value": "web", "label": "Web" },
            { "value": "email", "label": "Email" }
        ],
        "allowEmpty": true
    }
}
```

**Value example**

```json
{ "en": ["web", "email"] }
```

---

## core/date

**Category:** Date & time · **Source:** `packages/core/src/fields/core/date.ts`

**What it does:** Stores a **calendar date** without time zone complexity—string **`YYYY-MM-DD`**.

**When to use it:** Birth dates, publish **dates**, deadlines where time of day does not matter.

| Option        | Type | Default | Description                   |
| ------------- | ---- | ------- | ----------------------------- |
| `min`         | text | —       | Earliest date (`YYYY-MM-DD`). |
| `max`         | text | —       | Latest date (`YYYY-MM-DD`).   |
| `placeholder` | text | —       | Studio placeholder.           |
| `ui`          | text | —       | Studio hint.                  |

**Field example**

```json
{
    "key": "publishedOn",
    "type": "core/date",
    "label": "Publish date",
    "options": { "min": "2020-01-01" }
}
```

**Value example**

```json
{ "value": "2025-03-17" }
```

---

## core/datetime

**Category:** Date & time · **Source:** `packages/core/src/fields/core/datetime.ts`

**What it does:** Stores an **ISO 8601** date-time string (instant or local per your convention).

**When to use it:** Events, “last modified” style **timestamps** at field level, scheduling with time.

| Option        | Type | Default | Description                                       |
| ------------- | ---- | ------- | ------------------------------------------------- |
| `format`      | text | —       | Display format hint (e.g. `YYYY-MM-DD HH:mm:ss`). |
| `placeholder` | text | —       | Studio placeholder.                               |
| `ui`          | text | —       | Studio hint.                                      |

**Field example**

```json
{
    "key": "startsAt",
    "type": "core/datetime",
    "label": "Starts at",
    "required": true
}
```

**Value example**

```json
{ "value": "2025-03-17T14:30:00.000Z" }
```

---

## core/time

**Category:** Date & time · **Source:** `packages/core/src/fields/core/time.ts`

**What it does:** Stores **time of day** as **`HH:MM`** (no date).

**When to use it:** Opening hours, duration start/end in a day, reminders without tying to a full datetime field.

| Option | Type   | Default | Description                      |
| ------ | ------ | ------- | -------------------------------- |
| `min`  | text   | —       | Earliest time (`HH:MM`).         |
| `max`  | text   | —       | Latest time (`HH:MM`).           |
| `step` | number | `15`    | Step in **minutes** for pickers. |
| `ui`   | text   | —       | Studio hint.                     |

**Field example**

```json
{
    "key": "opensAt",
    "type": "core/time",
    "label": "Opens at",
    "options": { "step": 30 }
}
```

**Value example**

```json
{ "value": "09:30" }
```

---

## core/model-3d

**Category:** Media · **Source:** `packages/core/src/fields/core/model-3d.ts`

**What it does:** Points to a **3D asset** (usually **glTF/glb** URL) plus optional **poster** image and **USDZ** for iOS AR.

**When to use it:** Product viewers, AR placement—not generic “any file” (use **core/asset**).

| Option | Type | Default | Description                 |
| ------ | ---- | ------- | --------------------------- |
| `ui`   | text | —       | Studio hint: upload vs URL. |

**Field example**

```json
{
    "key": "viewer3d",
    "type": "core/model-3d",
    "label": "3D model",
    "required": true
}
```

**Value example**

```json
{
    "src": { "en": "https://cdn.example.com/model.glb" },
    "poster": { "en": "https://cdn.example.com/poster.jpg" },
    "alt": { "en": "Chair preview" },
    "usdz": { "en": "https://cdn.example.com/model.usdz" }
}
```

---

## core/asset

**Category:** Media · **Source:** `packages/core/src/fields/core/asset.ts`

**What it does:** References **one row** in the project’s **asset library** (image, video, or document) plus optional **alt** and **caption** at usage time.

**When to use it:** Single downloadable/file pickers when you do not need **core/image**’s layout-focused options.

**Stored value (Studio / typical API):** `{ "assetId": "…", "alt"?: "…", "caption"?: "…" }` (see `FieldAsset.tsx`).

| Option | Type | Default | Description                       |
| ------ | ---- | ------- | --------------------------------- |
| `ui`   | text | —       | Studio hint (`upload`, `url`, …). |

**Studio extras (not in core registry file):** implementations often support `accept`, `mockAsset`, `required` on `options` for the picker—check the Studio app when needed.

**Field example**

```json
{
    "key": "pdf",
    "type": "core/asset",
    "label": "PDF brochure",
    "options": { "ui": "upload" }
}
```

**Value example**

```json
{
    "assetId": "a1b2c3d4-0001-4000-8000-000000000099",
    "alt": { "en": "Brochure cover" },
    "caption": { "en": "Download our brochure" }
}
```

---

## core/asset-list

**Category:** Media · **Source:** `packages/core/src/fields/core/asset-list.ts`

**What it does:** Ordered list of **asset** references (same item shape as one **core/asset**).

**When to use it:** Galleries, attachment lists, carousels of library files.

| Option | Type | Default | Description  |
| ------ | ---- | ------- | ------------ |
| `ui`   | text | —       | Studio hint. |

**Value example**

```json
[
    { "assetId": "id-1", "alt": { "en": "First" } },
    { "assetId": "id-2", "caption": { "en": "Second slide" } }
]
```

---

## core/image

**Category:** Media · **Source:** `packages/core/src/fields/core/image.ts`

**What it does:** Full **image** field: **src** uses **core/media-image**, plus **alt**, **caption**, **credit**, **aria**, **role**, and presentation **options** (focal point, lazy load, etc.).

**When to use it:** Heroes, content images, thumbnails—default choice over raw **core/media-image**.

| Option        | Type    | Default  | Description                                       |
| ------------- | ------- | -------- | ------------------------------------------------- |
| `aspectRatio` | select  | `auto`   | `auto`, `1:1`, `16:9`, `4:3`, `3:2`.              |
| `responsive`  | boolean | `true`   | Allow responsive scaling in UI.                   |
| `loading`     | select  | `lazy`   | Native `loading`: `lazy`, `eager`, `auto`.        |
| `focalPoint`  | text    | `center` | CSS `object-position` hint.                       |
| `objectFit`   | select  | `cover`  | `cover`, `contain`, `fill`, `none`, `scale-down`. |
| `allowUpload` | boolean | `false`  | Allow direct upload in Studio.                    |
| `decorative`  | boolean | `false`  | Decorative → hide from AT when appropriate.       |
| `ui`          | text    | —        | Studio hint.                                      |

**Field example**

```json
{
    "key": "hero",
    "type": "core/image",
    "label": "Hero image",
    "options": { "aspectRatio": "16:9", "loading": "eager" }
}
```

**Value example**

```json
{
    "src": { "en": "https://cdn.example.com/hero.jpg" },
    "alt": { "en": "Team celebrating" },
    "caption": { "en": "Our office" },
    "role": "img"
}
```

---

## core/media-image

**Category:** Media · **Source:** `packages/core/src/fields/media/image.ts`

**What it does:** **Low-level** image **URL or path** only—no alt/caption layer.

**When to use it:** Inside **core/image** or rare cases where metadata lives elsewhere. **Not** in the Studio picker by design.

| Option              | Type   | Default     | Description              |
| ------------------- | ------ | ----------- | ------------------------ |
| `allowedExtensions` | list   | jpg, png, … | Allowed file extensions. |
| `maxSize`           | number | —           | Max file size (bytes).   |
| `maxWidth`          | number | —           | Max width (px).          |
| `maxHeight`         | number | —           | Max height (px).         |
| `ui`                | text   | —           | Studio hint.             |

**Value example**

```json
{ "src": { "en": "https://cdn.example.com/icon.png" } }
```

---

## core/video

**Category:** Media · **Source:** `packages/core/src/fields/core/video.ts`

**What it does:** **OEmbed-style** video: **provider** (YouTube, Vimeo, …) + **target** (id or slug) + optional title/caption.

**When to use it:** Embeds. For self-hosted MP4 as a file, consider **core/asset** + custom block.

| Option     | Type    | Default | Description           |
| ---------- | ------- | ------- | --------------------- |
| `autoplay` | boolean | `false` | Autoplay embed.       |
| `loop`     | boolean | `false` | Loop playback.        |
| `muted`    | boolean | `false` | Start muted.          |
| `controls` | boolean | `true`  | Show player controls. |
| `ui`       | text    | —       | Studio hint.          |

**Value example**

```json
{
    "provider": { "en": "youtube" },
    "target": { "en": "dQw4w9WgXcQ" },
    "title": { "en": "Overview" }
}
```

---

## core/email

**Category:** Links & contact · **Source:** `packages/core/src/fields/core/email.ts`

**What it does:** Single **email address** with **format validation**.

**When to use it:** Contact forms, user-facing emails. For display-only text without validation, **core/text** + `ui: email` is weaker—prefer this type when it’s really an email.

| Option        | Type    | Default | Description         |
| ------------- | ------- | ------- | ------------------- |
| `placeholder` | text    | —       | Studio placeholder. |
| `allowEmpty`  | boolean | `false` | Allow empty.        |
| `ui`          | text    | —       | Studio hint.        |

**Value example**

```json
{ "value": "hello@example.com" }
```

---

## core/link

**Category:** Links & contact · **Source:** `packages/core/src/fields/core/link.ts`

**What it does:** **Structured link:** URL, optional **label** and **ariaLabel**, plus behavior flags (`target`, `rel`, `download`, etc.).

**When to use it:** CTAs, nav items, accessible buttons-as-links. For a bare URL string, **core/url** is simpler.

| Option         | Type    | Default | Description                                  |
| -------------- | ------- | ------- | -------------------------------------------- |
| `target`       | select  | `_self` | `_self` or `_blank`.                         |
| `rel`          | list    | `[]`    | List of link `rel` tokens (e.g. `noopener`). |
| `icon`         | text    | —       | Optional icon id for UI kits.                |
| `isButton`     | boolean | —       | Render as button styling.                    |
| `download`     | boolean | `false` | Suggest download.                            |
| `prefetch`     | boolean | `false` | Hint prefetch / router preload.              |
| `relativeOnly` | boolean | `false` | Restrict to relative URLs.                   |
| `ui`           | text    | —       | Studio hint.                                 |

**Value example**

```json
{
    "url": { "en": "/pricing" },
    "label": { "en": "View pricing" },
    "ariaLabel": { "en": "Go to pricing page" }
}
```

---

## core/phone

**Category:** Links & contact · **Source:** `packages/core/src/fields/core/phone.ts`

**What it does:** Stores a **phone number as plain text**—**no** strict validation (international formats vary).

**When to use it:** Display and `tel:` links; validate in your own layer if you need E.164.

| Option        | Type    | Default | Description         |
| ------------- | ------- | ------- | ------------------- |
| `placeholder` | text    | —       | Studio placeholder. |
| `allowEmpty`  | boolean | `false` | Allow empty.        |
| `ui`          | text    | —       | Studio hint.        |

**Value example**

```json
{ "value": "+1 514 555 0199" }
```

---

## core/slug

**Category:** Links & contact · **Source:** `packages/core/src/fields/core/slug.ts`

**What it does:** **URL-safe** identifier; often **auto-generated** from another field (e.g. title). **`storeDirect: true`**—the value is typically the slug string (or map if multilingual).

**When to use it:** Permalinks, routing keys. Pair with **`sourceField`** so editors don’t hand-type slugs.

| Option         | Type    | Default | Description                                        |
| -------------- | ------- | ------- | -------------------------------------------------- |
| `multilingual` | boolean | `false` | Per-locale slugs vs single slug.                   |
| `sourceField`  | text    | —       | Field key to derive from (e.g. `title`).           |
| `separator`    | text    | `-`     | Word separator character.                          |
| `uniqueScope`  | select  | `model` | `global`, `model`, or `none` uniqueness semantics. |
| `allowCustom`  | boolean | `true`  | Editors may override auto slug.                    |
| `lowercase`    | boolean | `true`  | Force lower case.                                  |
| `ui`           | text    | —       | Studio hint.                                       |

**Value example** (single-locale)

```json
"my-blog-post"
```

---

## core/url

**Category:** Links & contact · **Source:** `packages/core/src/fields/core/url.ts`

**What it does:** **URL string** per locale—lighter than **core/link** (no structured label/rel).

**When to use it:** Social links, “website” fields, 3D **src** in **core/model-3d**.

| Option | Type | Default | Description  |
| ------ | ---- | ------- | ------------ |
| `ui`   | text | —       | Studio hint. |

**Value example**

```json
{
    "url": { "en": "https://example.com/article" }
}
```

---

## core/json

**Category:** Structured data · **Source:** `packages/core/src/fields/core/json.ts`

**What it does:** **Arbitrary JSON** object—escape hatch when no core type fits.

**When to use it:** Integrations, experiments, or when you’ll validate yourself via **`schema`** (JSON Schema).

| Option       | Type    | Default | Description                                                                            |
| ------------ | ------- | ------- | -------------------------------------------------------------------------------------- |
| `schema`     | object  | —       | Optional **JSON Schema** (Draft 2020-12 / compatible); validated with **Ajv** in core. |
| `allowEmpty` | boolean | `false` | Allow null/empty object if your pipeline supports it.                                  |
| `ui`         | text    | —       | Studio hint (`editor`, `textarea`, …).                                                 |

**Value example**

```json
{
    "value": {
        "any": "structure",
        "count": 42
    }
}
```

---

## core/list

**Category:** Structured data · **Source:** `packages/core/src/fields/core/list.ts`

**What it does:** **Repeater**: an array of items, each matching an **item schema** (usually **core/object** subtree).

**When to use it:** FAQs, team members **without** a shared Structure, bullet lists with structure.

| Option        | Type    | Default | Description                                           |
| ------------- | ------- | ------- | ----------------------------------------------------- |
| `allowEmpty`  | boolean | `false` | Allow zero items.                                     |
| `minItems`    | number  | `0`     | Minimum count.                                        |
| `maxItems`    | number  | —       | Maximum count.                                        |
| `sortable`    | boolean | `true`  | Allow reorder in Studio.                              |
| `uniqueItems` | boolean | `false` | Items must be unique (per serialized equality rules). |
| `ui`          | text    | —       | Studio hint.                                          |

**Field example** (conceptual—the `items` sub-schema lives on the field definition in Blueprints/Studio)

```json
{
    "key": "faq",
    "type": "core/list",
    "label": "FAQ",
    "options": { "minItems": 1, "sortable": true }
}
```

**Value example**

```json
{
    "items": [
        { "q": { "en": "Shipping?" }, "a": { "en": "Free over $50." } },
        { "q": { "en": "Returns?" }, "a": { "en": "30 days." } }
    ]
}
```

---

## core/object

**Category:** Structured data · **Source:** `packages/core/src/fields/core/object.ts`

**What it does:** **Named bag of child fields** you define inline on the model/block—like a JSON object with a schema.

**When to use it:** One-off groups that won’t be reused. For reuse across models, use **core/structure**.

| Option       | Type    | Default | Description                           |
| ------------ | ------- | ------- | ------------------------------------- |
| `allowEmpty` | boolean | `true`  | Allow `{}` when no required children. |
| `ui`         | text    | —       | Studio hint.                          |

**Value example**

```json
{
    "value": {
        "headline": { "en": "Welcome" },
        "subhead": { "en": "Glad you are here" }
    }
}
```

---

## core/structure

**Category:** Structured data · **Source:** `packages/core/src/fields/core/structure.ts`

**What it does:** Same idea as **core/object**, but the **shape** comes from a **shared Structure** (`structure` id) or **`inlineSchema`**.

**When to use it:** Repeatable “business cards”: address blocks, author bios, specs—define once, reference everywhere.

| Option         | Type   | Default | Description                                       |
| -------------- | ------ | ------- | ------------------------------------------------- |
| `structure`    | text   | —       | ID of shared structure (e.g. `myApp/teamMember`). |
| `inlineSchema` | object | —       | Full inline field map instead of id.              |
| `ui`           | text   | —       | Studio hint.                                      |

**Value example**

```json
{
    "value": {
        "name": { "en": "Alex" },
        "role": { "en": "Editor" }
    }
}
```

---

## core/table

**Category:** Structured data · **Source:** `packages/core/src/fields/core/table.ts`

**What it does:** **2D grid**: rows of cells, optional **row/column titles**, optional **source** link to external data.

**When to use it:** Comparison tables, simple data grids—not a spreadsheet engine.

| Option               | Type    | Default | Description                               |
| -------------------- | ------- | ------- | ----------------------------------------- |
| `validateCellSchema` | object  | —       | Per-cell **Field** schema for validation. |
| `minRows`            | number  | —       | Minimum row count.                        |
| `maxRows`            | number  | —       | Maximum row count.                        |
| `minCols`            | number  | —       | Minimum column count.                     |
| `maxCols`            | number  | —       | Maximum column count.                     |
| `allowEmptyCells`    | boolean | `true`  | Allow blank cells.                        |
| `ui`                 | text    | —       | Studio hint.                              |

**Value example** (shape illustrative)

```json
{
    "rows": [
        [{ "en": "A1" }, { "en": "B1" }],
        [{ "en": "A2" }, { "en": "B2" }]
    ],
    "columnTitles": [{ "en": "Col A" }, { "en": "Col B" }]
}
```

---

## core/layout

**Category:** Structured data · **Source:** `packages/core/src/fields/core/layout.ts`

**What it does:** Binds content to a **Layout resource**: you set **`layoutId`** and an array of **`slots`**. Each slot has **`id`** (matches `Layout.blocks[i].meta.id` or index as `"0"`, `"1"`, …) and **`data`** (only the block’s fields).

**When to use it:** Pages with a **fixed wireframe** (hero + sidebar) where editors must not add/remove blocks—only fill regions.

**Validation:** `validateLayoutField` (shape) + **`validateLayoutFieldValues`** (loads Layout from project, validates each slot’s `data` against block types).

| Option            | Type    | Default | Description                                                   |
| ----------------- | ------- | ------- | ------------------------------------------------------------- |
| `defaultLayoutId` | text    | —       | If set, stored `layoutId` must match (single allowed layout). |
| `allowEmpty`      | boolean | `false` | Allow null/empty field.                                       |

**Field example**

```json
{
    "key": "regions",
    "type": "core/layout",
    "label": "Page regions",
    "options": { "defaultLayoutId": "marketing-hero-two-col" }
}
```

**Value example**

```json
{
    "layoutId": "marketing-hero-two-col",
    "slots": [
        { "id": "0", "data": { "title": { "en": "Hello" } } },
        {
            "id": "sidebar",
            "data": { "cta": { "url": { "en": "/signup" }, "label": { "en": "Sign up" } } }
        }
    ]
}
```

---

## core/block-list

**Category:** Structured data · **Source:** `packages/core/src/fields/core/block-list.ts`

**What it does:** Stores **`Block[]`** directly on the page/entry—**freeform** composition: add, remove, reorder **instances** (same item shape as `Layout.blocks`).

**When to use it:** Article bodies, landing pages built from a block library. Constrain allowed types with **`allowedBlockTypes`**.

| Option              | Type       | Default | Description                                                |
| ------------------- | ---------- | ------- | ---------------------------------------------------------- |
| `allowedBlockTypes` | JSON array | —       | Allowlist of block type ids; omit = all registered blocks. |
| `minBlocks`         | number     | `0`     | Minimum block count.                                       |
| `maxBlocks`         | number     | —       | Maximum block count.                                       |
| `allowEmpty`        | boolean    | `false` | Allow null/empty list.                                     |

**Value example**

```json
[
    {
        "type": "core/heading",
        "data": { "text": { "en": "Chapter 1" } },
        "meta": { "id": "blk-1" }
    },
    {
        "type": "core/paragraph",
        "data": { "content": { "en": "Body copy…" } }
    }
]
```

---

## core/categories

**Category:** Relations · **Source:** `packages/core/src/fields/core/categories.ts`

**What it does:** List of **category ids** from a **taxonomy** defined elsewhere (`source`).

**When to use it:** Blog sections, product taxonomies—structured many-to-many with a category model.

| Option     | Type    | Default      | Description                                        |
| ---------- | ------- | ------------ | -------------------------------------------------- |
| `multiple` | boolean | `true`       | Allow more than one category.                      |
| `source`   | text    | **required** | Where categories live (e.g. `project/categories`). |
| `ui`       | text    | —            | Studio hint.                                       |

**Value example**

```json
{
    "items": ["cat-news", "cat-featured"]
}
```

---

## core/relation

**Category:** Relations · **Source:** `packages/core/src/fields/core/relation.ts`

**What it does:** **One** link to an **entry** in another **model**—stored as an object with **id**, **label**, **model** (exact shape per API).

**When to use it:** Author, brand, parent page—single reference.

| Option       | Type    | Default      | Description                                               |
| ------------ | ------- | ------------ | --------------------------------------------------------- |
| `model`      | text    | **required** | Target model id.                                          |
| `labelField` | text    | —            | Which field to show as label (default: first text field). |
| `allowEmpty` | boolean | `false`      | Allow no selection.                                       |
| `ui`         | text    | —            | Studio hint (`search`, `dropdown`, …).                    |

**Value example**

```json
{
    "value": {
        "id": "entry-uuid",
        "model": "authors",
        "label": { "en": "Jane Doe" }
    }
}
```

---

## core/relations

**Category:** Relations · **Source:** `packages/core/src/fields/core/relations.ts`

**What it does:** **Many** entry references—same reference object shape as **core/relation**, in an array.

**When to use it:** Related articles, curated lists, many-to-many through explicit picks.

| Option       | Type    | Default      | Description                    |
| ------------ | ------- | ------------ | ------------------------------ |
| `model`      | text    | **required** | Target model id.               |
| `labelField` | text    | —            | Label field on target entries. |
| `allowEmpty` | boolean | `true`       | Allow empty array.             |
| `sortable`   | boolean | `true`       | Reorder in Studio.             |
| `minItems`   | number  | `0`          | Minimum relations.             |
| `maxItems`   | number  | —            | Maximum relations.             |
| `ui`         | text    | —            | Studio hint.                   |

**Value example**

```json
{
    "value": [
        { "id": "a", "model": "posts", "label": { "en": "Post A" } },
        { "id": "b", "model": "posts", "label": { "en": "Post B" } }
    ]
}
```

---

## core/tags

**Category:** Relations · **Source:** `packages/core/src/fields/core/tags.ts`

**What it does:** List of **tag ids** from a **tag model** (`source`)—not the same as **core/multi-select** (free choices on this entry only).

**When to use it:** Global tag vocabulary, filtering, tag clouds.

| Option      | Type    | Default      | Description                                       |
| ----------- | ------- | ------------ | ------------------------------------------------- |
| `allowNew`  | boolean | `true`       | Allow creating new tags in Studio (if supported). |
| `maxTags`   | number  | `10`         | Cap count.                                        |
| `separator` | text    | `,`          | Display / input separator hint.                   |
| `source`    | text    | **required** | Tag model reference (e.g. `project/tags`).        |
| `ui`        | text    | —            | Studio hint.                                      |

**Value example**

```json
{
    "value": ["tag-research", "tag-product"]
}
```

---

## core/address

**Category:** System · **Source:** `packages/core/src/fields/core/address.ts`

**What it does:** **Postal address** split into conventional parts (street, city, …).

**When to use it:** Shipping, store locator, structured address without maps.

| Option | Type | Default | Description  |
| ------ | ---- | ------- | ------------ |
| `ui`   | text | —       | Studio hint. |

**Value example**

```json
{
    "street": { "en": "123 Main St" },
    "city": { "en": "Montreal" },
    "state": { "en": "QC" },
    "postalCode": { "en": "H2X 1Y2" },
    "country": { "en": "CA" }
}
```

---

## core/color

**Category:** System · **Source:** `packages/core/src/fields/core/color.ts`

**What it does:** **Hex color** string with optional **alpha** and **presets**.

**When to use it:** Theme tokens, brand colors, UI customization.

| Option         | Type    | Default | Description                                  |
| -------------- | ------- | ------- | -------------------------------------------- |
| `allowAlpha`   | boolean | `false` | 8-digit `#RRGGBBAA` style support when true. |
| `presetColors` | list    | —       | Swatches to pick from.                       |
| `allowCustom`  | boolean | `true`  | Allow free hex input.                        |
| `ui`           | text    | —       | Studio hint (`picker`, `swatches`, …).       |

**Value example**

```json
{ "color": "#3366FF" }
```

---

> Geo is now provided by the optional `geo` plugin (`geo/location`, `geo/area`, `geo/polyline`, `geo/map`).
> If you previously used `core/geo`, migrate to `geo/location`.

---

## core/icon

**Category:** System · **Source:** `packages/core/src/fields/core/icon.ts`

**What it does:** **Icon id** string (e.g. `lucide:home`)—no validation; your front-end maps ids to SVG/font.

**When to use it:** Configurable icons in nav or feature lists.

| Option | Type | Default | Description                                            |
| ------ | ---- | ------- | ------------------------------------------------------ |
| `set`  | text | —       | Hint for which icon family (`lucide`, `heroicons`, …). |
| `ui`   | text | —       | Studio hint (`picker`, `input`).                       |

**Value example**

```json
{ "value": { "en": "lucide:rocket" } }
```

---

## core/id

**Category:** System · **Source:** `packages/core/src/fields/core/id.ts`

**What it does:** **UUID** for an entry—**generated by the system**, **read-only** in APIs (ignored on create/update body).

**When to use it:** Expose stable ids in schemas and Studio as read-only; don’t use for business keys—use **core/slug**.

| Option | Type | Default | Description  |
| ------ | ---- | ------- | ------------ |
| `ui`   | text | —       | Studio hint. |

**Value example**

```json
{ "value": "a1b2c3d4-0001-4000-8000-000000000001" }
```

---

## core/order

**Category:** System · **Source:** `packages/core/src/fields/core/order.ts`

**What it does:** **Integer** used for **manual sort order** in lists.

**When to use it:** Featured order, carousel sequence—**not** for prices (use **core/number**).

| Option    | Type   | Default | Description                           |
| --------- | ------ | ------- | ------------------------------------- |
| `default` | number | `0`     | Default when creating.                |
| `ui`      | text   | —       | Studio hint (`input`, `drag-handle`). |

**Value example**

```json
{ "value": 10 }
```

---

## core/status

**Category:** System · **Source:** `packages/core/src/fields/core/status.ts`

**What it does:** **Workflow state** (`draft`, `published`, …)—driven by **`values`** list in options.

**When to use it:** Editorial workflow on entries; opt-in per model.

| Option    | Type  | Default                       | Description                               |
| --------- | ----- | ----------------------------- | ----------------------------------------- |
| `values`  | array | draft / in_review / published | Allowed statuses (value + label objects). |
| `default` | text  | `draft`                       | Initial status on create.                 |
| `ui`      | text  | —                             | Studio hint.                              |

**Value example**

```json
{ "value": "published" }
```

---

## Usage, alignment, audits

- **Defining fields:** Set `type`, `label`, `required`, and `options` on each field in models, structures, blocks, and templates. See [Blueprints](Blueprints.md), the [REST API](REST%20API.md), and [`@moteurio/client`](../packages/client/README.md).
- **Implementation:** `packages/core/src/fields/index.ts` loads all registrations; validators live under `packages/core/src/validators/`.
- **Studio picker:** Order and labels match the Studio front-end’s `src/components/field-builders/fieldTypes.tsx`.
- **Validators (behavior, locale maps, required):** [Field-validators.md](Field-validators.md).
- **Coverage audit:** [Fields-Audit.md](Fields-Audit.md).

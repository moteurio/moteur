# Blocks reference

Blocks are content units that live inside **layouts** and **block-list** fields. Each block has a **type** (e.g. `core/hero`, `mysite/promo`) and typed **data**. Block **schemas** define fields; **instances** live in layout JSON or entry/page field JSON.

---

## Global vs project block schemas

| Layer        | Storage (typical)                                       | Type id prefix | Who changes it                                                                |
| ------------ | ------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| **Built-in** | Plugin (`core-blocks`) and/or `data/core/blocks/*.json` | `core/`        | Operators (global API) or release/seed                                        |
| **Project**  | `data/projects/<projectId>/blocks/<slug>.json`          | `<projectId>/` | Anyone with project access (Studio `POST/PATCH/DELETE …/projects/:id/blocks`) |

**Merge order** when resolving types for a project: core files → project block files → plugin registry (later layers override earlier keys with the same type id).

**Validation** uses the same merged registry for that `projectId`, so project-only types validate correctly for layouts, pages, and entries.

**Forking core blocks:** Do not mutate `core/*` in place for one customer. Add a project block with a new slug (e.g. `mysite/hero`) and copy/adapt the schema; instances use the new type id.

**Blueprints** scaffold models, layouts, and structures when creating a project; they do **not** copy block definition files. Projects still rely on `core/*` (and optional project blocks) for types.

---

## Core blocks (built-in)

| Name               | Description                       | Typical usage                                | Key fields                          |
| ------------------ | --------------------------------- | -------------------------------------------- | ----------------------------------- |
| **core/accordion** | Expandable list of sections       | FAQs, multi-step guides, collapsible content | `items`: list of `title`, `content` |
| **core/container** | Container for nested blocks       | Layout control, columns, grouped content     | `blocks[]`, `style`, `alignment`    |
| **core/gallery**   | Image grid or carousel            | Showcases, product images, event photos      | `images[]`, `layout`, `columns`     |
| **core/hero**      | Large banner with title/cta       | Page header, promo block                     | `title`, `subtitle`, `image`, `cta` |
| **core/image**     | Full-width or decorative image    | Separators, illustrations, standalone images | `src`, `alt`, `caption`             |
| **core/quote**     | Highlighted quotation with author | Testimonials, literary quotes, pull quotes   | `text`, `author`, `authorImage`     |
| **core/spacer**    | Vertical space between blocks     | Layout separation or rhythm                  | `size`, `unit`                      |
| **core/text**      | Simple paragraph block            | Content sections, intros, descriptions       | `content`: rich text                |
| **core/video**     | Embedded video block              | YouTube, Vimeo, self-hosted embeds           | `url`, `autoplay`, `caption`        |

---

## HTTP API (summary)

- **List / get / create / update / delete project-scoped definitions:** `GET|POST /projects/:projectId/blocks`, `GET|PUT|PATCH|DELETE /projects/:projectId/blocks/:slug`. Short slug `hero` resolves to `projectId/hero` if present, otherwise `core/hero`. Mutations apply only to files under `data/projects/<projectId>/blocks/`.
- **Global catalog + register `core/*` type:** `GET|POST {API_BASE_PATH}/moteur/blocks` (if `API_BASE_PATH` is empty, `/api/moteur/blocks` is also served for compatibility). **POST requires operator** and writes `data/core/blocks/`.

See [REST API](REST%20API.md) for layout, block, and structure routes under `/projects/:projectId/...`, and [`@moteurio/client`](../packages/client/README.md) for typed HTTP calls. [Embedded `@moteurio/core`](Developer%20API.md) remains available for in-process monorepo tooling only.

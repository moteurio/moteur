# Blocks reference

Blocks are content units that live inside **layouts** and **block-list** fields. Each block has a **type** (e.g. `core/hero`, `mysite/promo`) and typed **data**. Block **schemas** define fields; **instances** live in layout JSON or entry/page field JSON.

---

## Global vs project block schemas

| Layer        | Storage (typical)                                            | Type id prefix | Who changes it                                                                                                                             |
| ------------ | ------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Built-in** | Shipped in `@moteurio/core` and/or `data/core/blocks/*.json` | `core/`        | Engine release; operators can add or change them in Studio **Operator › Blocks & structures**, or via `{basePath}/operator/schemas/blocks` |
| **Project**  | `data/projects/<projectId>/blocks/<name>.json`               | none (`hero`)  | Anyone with project access (Studio `POST/PATCH/DELETE …/projects/:id/blocks`)                                                              |

**The rule:** a name with a slash is the server's (`core/hero`, a plugin's `geo/map`). A name without one is the project's own (`hero`). Structures follow the same rule (`cta`, `core/seo`). Content stores the name as it is, so a project's content doesn't carry the project's id and moves to another project as it is. A project block named with a slash is refused.

**Merge order** when resolving types for a project: shipped built-ins, then `data/core` files, then project block files. A later layer overrides the same type id. A plugin that registers a block does so at the shipped layer, so a file still wins.

**Validation** uses the same merged registry for that `projectId`, so project-only types validate correctly for layouts, pages, and entries.

**Forking core blocks:** Do not mutate `core/*` in place for one customer. Add a project block (e.g. `hero`, beside the server's `core/hero`) and copy its schema. Content uses the new name.

**Blueprints** scaffold models, layouts, and structures when creating a project; they do **not** copy block definition files. Projects still rely on `core/*` (and optional project blocks) for types.

---

## Core blocks (built-in)

Registered in [`packages/core/src/plugins/builtinContent.ts`](../packages/core/src/plugins/builtinContent.ts) (override with `data/core/blocks/*.json`).

| Type               | Description                 | Key fields                                          |
| ------------------ | --------------------------- | --------------------------------------------------- |
| **core/paragraph** | Rich text paragraph         | `content`                                           |
| **core/heading**   | Semantic heading (h1–h6)    | `text`, `level`                                     |
| **core/hero**      | Page banner                 | `title`, `subtitle`, `backgroundImage`, `alignment` |
| **core/image**     | Single image                | `image`, `title`, `caption`, `credit`               |
| **core/gallery**   | Image row                   | `images`, `caption`                                 |
| **core/quote**     | Quotation                   | `text`, `author`, `attribution`                     |
| **core/spacer**    | Vertical space              | `size`, `custom`                                    |
| **core/divider**   | Horizontal rule             | —                                                   |
| **core/button**    | CTA link                    | `link`, `label`                                     |
| **core/code**      | Code listing                | `code`, `language`, `filename`                      |
| **core/note**      | Editorial note (non-public) | `text`                                              |
| **core/embed**     | oEmbed-style URL            | `url`, `title`                                      |
| **core/table**     | Table field                 | `table`, `caption`                                  |
| **core/video**     | Video asset                 | `video`, `title`, `description`                     |
| **core/audio**     | Audio file                  | `src`, `title`, `transcript`                        |
| **core/form**      | Embedded form               | `formId`, `title`, `successMessage`                 |

---

## HTTP API (summary)

- **List / get / create / update / delete project-scoped definitions:** `GET|POST /projects/:projectId/blocks`, `GET|PUT|PATCH|DELETE /projects/:projectId/blocks/:slug`. `:slug` is the block's name: `hero` is the project's own, `core%2Fhero` the server's (one encoded segment). Mutations apply only to files under `data/projects/<projectId>/blocks/`.
- **Global catalog + register `core/*` type:** `GET|POST {API_BASE_PATH}/moteur/blocks`. **POST requires operator** and writes `data/core/blocks/`.

See [REST API](REST%20API.md) for layout, block, and structure routes under `/projects/:projectId/...`, and [`@moteurio/client`](../packages/client/README.md) for typed HTTP calls. [Embedded `@moteurio/core`](Developer%20API.md) remains available for in-process monorepo tooling only.

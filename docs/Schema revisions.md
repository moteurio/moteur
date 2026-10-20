# Schema revisions

Project **schemas** (models, structures, templates, forms, and project-scoped blocks) live in the Git-tracked project tree. Every schema save creates a commit on the current content branch, same as entries and pages. Moteur exposes that history as **revisions** so Studio can show past versions and admins can **restore** the live schema from an older commit.

This is separate from **entry** revisions and from **publish** snapshots on entries. See [How schema changes affect a project](#how-schema-changes-affect-a-project) below.

Related: [Git integration](Git.md), [REST API](REST%20API.md), [Public API and Collections](Public%20API%20and%20Collections.md).

---

## What is versioned

| Kind                                         | Git path (under project root)    | History in API                    |
| -------------------------------------------- | -------------------------------- | --------------------------------- |
| Model                                        | `models/{modelId}/model.json`    | Yes                               |
| Structure (project-owned)                    | `structures/{id}/structure.json` | Yes                               |
| Page template                                | `templates/{id}.json`            | Yes                               |
| Form                                         | `forms/{formId}/form.json`       | Yes                               |
| Project block                                | `blocks/{slug}.json`             | Yes                               |
| Built-in structure/block (`core/*`, plugins) | Not in the project repo          | Empty list; restore not available |

Built-in types are merged at runtime from `@moteurio/core`, plugins, and `data/core/`. Only files under `data/projects/{projectId}/` appear in git history for that project.

Workspace snapshots (`moteur-workspace-snapshots`) and user-data snapshots do **not** include schemas; schemas are on the main content branch history. See [Git integration](Git.md).

---

## Revision identity: commit hash vs `number`

Each revision in the API uses the same shape as entry revisions (`EntryRevision` in OpenAPI):

| Field        | Meaning                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**     | Full **Git commit hash** (40 characters). This is the stable identifier. Use it in `GET …/revisions/{revisionId}` and `POST …/revisions/{revisionId}/restore`.                                                                  |
| **`number`** | A **display ordinal** for that response only: newest commit in the list gets the highest number, counting down. It is **not** a permanent schema version label and can change when new saves happen or when you change `?max=`. |
| `message`    | Git commit subject (e.g. `Update model article — Alice`).                                                                                                                                                                       |
| `savedAt`    | Commit author date (ISO 8601).                                                                                                                                                                                                  |
| `savedBy`    | Git author name.                                                                                                                                                                                                                |

**Do not link integrations or docs to `number`.** Link or store **`id` (commit hash)** if you need to refer to “the schema as it was at commit X”.

Example: fetch the model schema at a known commit:

```http
GET {basePath}/projects/:projectId/models/:modelId/revisions/abc1234…def
Authorization: Bearer <jwt>
```

Response: `{ "model": { … } }` — the parsed `model.json` at that commit.

There is **no** query parameter on the public collection API to “read entries using schema at revision X”. The live schema endpoints and collection OpenAPI always reflect **what is on disk now**.

---

## HTTP API (JWT + project access)

Paths mirror **entry** revisions: same resource prefix, then `/revisions`.

| Resource  | List                               | Read at commit                               | Restore (project admin)                               |
| --------- | ---------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Model     | `GET …/models/{modelId}/revisions` | `GET …/revisions/{revisionId}` → `{ model }` | `POST …/revisions/{revisionId}/restore` → `{ model }` |
| Structure | `GET …/structures/{id}/revisions`  | `{ structure }`                              | same                                                  |
| Template  | `GET …/templates/{id}/revisions`   | `{ template }`                               | same                                                  |
| Form      | `GET …/forms/{formId}/revisions`   | `{ form }`                                   | same                                                  |
| Block     | `GET …/blocks/{slug}/revisions`    | `{ block }`                                  | same (project block file only)                        |

Query on list: `?max=N` (default 20, max 100). Newest commits first.

If the project is **not** a Git repository, list returns `[]` (Studio shows an empty history message).

Low-level alternative: `GET /projects/:projectId/git/log?path=models/article/model.json` returns raw commits for any project-relative path. See [Git integration](Git.md).

---

## Studio

In **Moteur Studio** (Setup):

- **Models** and each schema type (structures, blocks, templates, forms) have a **History** tab.
- Anyone with project access can browse revisions and open read-only JSON at a commit.
- **Restore** is limited to project **admins** and only for schemas stored in the project tree (not built-in `core/*` copies).

Restore writes the chosen snapshot as the **current** schema (new git commit via the normal save pipeline). It does **not** rewrite entry files or migrate content automatically.

---

## How schema changes affect a project

Think of two layers:

1. **Schema (contract)** — what fields exist, types, forms, block types, collection field allowlists, generated OpenAPI.
2. **Content (instances)** — entry `data`, page fields, layout blocks, form submissions.

Schema revisions help you **recover or inspect the contract**. Content keeps whatever was saved until someone edits it.

### Live behaviour (always “current schema”)

| Area                                                 | Behaviour when you change a schema                                                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Studio editors**                                   | Forms and field lists follow the **current** model/template immediately. Removing a field hides it in the UI; existing JSON may still contain the old key until edited or cleaned.                                        |
| **Validation on save**                               | Entries and pages are validated against **current** field definitions. Required fields apply on publish/review; extra keys in `data` that are no longer in the schema are generally **left in place** (not auto-deleted). |
| **Public API / collections**                         | Responses use **current** models and field allowlists. Removed fields disappear from API output even if still stored in the entry file.                                                                                   |
| **Collection OpenAPI** (`…/collections/:id/openapi`) | Generated from **current** project schemas. Clients codegen against today’s shapes; a breaking schema change changes the spec on the next request.                                                                        |
| **Block / structure types**                          | Instances reference a **type id** (e.g. `core/hero`, `mysite/promo`). Changing the schema changes validation and Studio for new edits; existing block JSON may contain fields that are no longer defined until updated.   |
| **Forms (public submit)**                            | Submit validates against the **current** form schema.                                                                                                                                                                     |

### What schema revisions do **not** do (today)

- They do **not** pin a collection or API key to a fixed schema revision (planned as a separate “contract pinning” feature).
- They do **not** freeze entry **content** — that is **[entry publish](Workflows.md)** (`publishedCommit` on the entry audit), which snapshots the entry file at publish time for the public **published** view.
- Restore does **not** bulk-update entries, pages, or layouts to match an old schema.

### Practical impact of common changes

| Change                    | Typical impact                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Add optional field        | Safe. Old entries omit it; editors can fill it in.                                          |
| Add required field        | Existing drafts may warn/fail validation until filled; publish/review may block.            |
| Remove field              | Data often remains in JSON; public API may omit it; Studio may no longer show it.           |
| Change field type         | Existing values may fail validation on next save; fix or migrate data manually.             |
| Rename field              | Treated as remove + add unless you migrate entry data (no automatic rename).                |
| Change model `urlPattern` | Affects URL generation for collection pages; existing slugs unchanged until entries change. |

After a mistaken schema edit, **History → Restore** puts the project schema file back; then fix content in Studio or with scripts/CLI as needed.

---

## Content vs schema versioning (summary)

```text
Entry file (models/…/entry.json)
  ├── Draft/edits: latest save on current branch
  └── Published view: optional frozen snapshot via publishedCommit (entry revision)

Model file (models/…/model.json)
  └── Schema revisions: full git history; restore replaces live schema
```

| Question                                         | Answer                                                  |
| ------------------------------------------------ | ------------------------------------------------------- |
| Link to exact schema version?                    | Yes: **commit hash** in `revisionId`, not `number`.     |
| Link to exact entry content for the public site? | **publishedCommit** on the entry (entry revisions API). |
| Does the headless API stay on an old schema?     | No — always current schema and collection config.       |

---

## See also

- [Git integration](Git.md) — commits, branches, workspace snapshots
- [Workflows](Workflows.md) — publish and entry lifecycle
- [Blocks](Blocks.md) — built-in vs project block types
- [Public API and Collections](Public%20API%20and%20Collections.md) — channels and OpenAPI

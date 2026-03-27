# Blueprints

Blueprints are **reusable templates** with a **kind**: project, model, or structure. They share the same storage and API; the **kind** determines how the template is used.

- **Project blueprints** (`kind: 'project'` or omitted): used when creating a new project. The template can define initial models, layouts, and structures applied to the new project.
- **Model blueprints** (`kind: 'model'`): a single model schema template. Used to create a model in an existing project (e.g. “Create model from template” with a dropdown of model blueprints).
- **Structure blueprints** (`kind: 'structure'`): a single structure schema template. Used to create a structure in an existing project.

## Blueprints vs block definitions

Blueprints are **server-wide templates** (project / model / structure / page template). They are **not** stored inside a project folder. Applying a **project** blueprint at `POST /projects` creates **models, layouts, and structures** in the new project; it does **not** copy block schema files. Block types still come from **`core/*`**, plugins, and optional **`data/projects/<id>/blocks/`** (see [Blocks](Blocks.md)).

## Where blueprints live (backend)

- **Storage:** Blueprints are stored as JSON files under the **blueprints directory**, in **kind-specific subfolders**.
- **Default path:** `data/blueprints/` (relative to the data root — same as `DATA_ROOT` or the resolved Moteur data directory).
- **Override:** Set `BLUEPRINTS_DIR` to use another path (relative to the data root).
- **Subfolders:** `data/blueprints/projects/`, `data/blueprints/models/`, `data/blueprints/structures/`. Each blueprint is a single file: `data/blueprints/<kind>/<id>.json`. The `id` must be filesystem-safe (alphanumeric, hyphens, underscores; same rules as project ids). IDs are unique **within** a kind, so `blog` can exist as both a project and a model blueprint.
- **Migration:** On first use, any root-level `.json` files in `data/blueprints/` are automatically moved to `data/blueprints/projects/`.

## Blueprint JSON shape

### Project blueprint (default)

```json
{
    "id": "blog",
    "name": "Blog Site",
    "description": "Your regular personal blog with posts, listing, and comments.",
    "template": {
        "models": [],
        "layouts": [],
        "structures": []
    }
}
```

- **id** (required): Unique id; must match the filename (without `.json`).
- **name** (required): Display name (e.g. in the project creation wizard).
- **description** (optional): Short explanation of the blueprint.
- **kind** (optional): Omit or set to `"project"` for project blueprints.
- **template** (optional): Object with:
    - **models**: Array of model schema objects to create in the new project.
    - **layouts**: Array of layout objects to create.
    - **structures**: Array of structure schema objects to create.

If `template` is missing or has empty arrays, the blueprint only provides metadata (e.g. “Empty Project”); the project is created with no extra models, layouts, or structures.

### Model blueprint

```json
{
  "id": "model-blog-post",
  "name": "Blog Post",
  "description": "A content model for a single blog post.",
  "kind": "model",
  "template": {
    "model": {
      "id": "post",
      "label": "Blog Post",
      "modelType": "content",
      "fields": { ... }
    }
  }
}
```

- **kind**: `"model"`.
- **template.model** (required): A single model schema object. Validated on create/update of the blueprint.

### Structure blueprint

```json
{
  "id": "struct-team-member",
  "name": "Team Member",
  "description": "Reusable team member structure.",
  "kind": "structure",
  "template": {
    "structure": {
      "type": "project/teamMember",
      "label": "Team Member",
      "fields": { ... }
    }
  }
}
```

- **kind**: `"structure"`.
- **template.structure** (required): A single structure schema object. Validated on create/update of the blueprint.

## How “create from blueprint” works

### Project creation (project blueprints only)

1. **Create project:** The client calls `POST /projects` with the usual project payload (`id`, `label`, `defaultLocale`, etc.) and an optional **blueprintId**.
2. **Project creation:** The backend creates the project as usual (project record, storage, etc.).
3. **Apply template:** If `blueprintId` is present and valid and the blueprint has **kind** `'project'` (or no kind), the backend loads it and, if it has a `template` with `models`/`layouts`/`structures`:
    - Creates each **model** in the new project (same as a normal “create model” call).
    - Creates each **layout** in the new project.
    - Creates each **structure** in the new project.
4. **Response:** The API returns the created project. Any template application errors are logged; the project is still considered created.

Only blueprints with `kind === 'project'` (or kind omitted) are applied at project creation.

### Create model from blueprint

When creating a model in an existing project, the client can send **blueprintId** in the body of `POST /projects/:projectId/models`. The backend loads the blueprint, checks `kind === 'model'`, uses `template.model` as the base schema, and merges any other body fields (e.g. `id`, `label`) as overrides, then creates the model. This allows “Create model from template” with a dropdown of model blueprints (from `GET /blueprints/models`).

### Create structure from blueprint

When creating a structure in an existing project, the client can send **blueprintId** in the body of the create-structure endpoint. The backend loads the blueprint, checks `kind === 'structure'`, uses `template.structure` as the base schema, and merges any other body fields as overrides, then creates the structure. List structure blueprints with `GET /blueprints/structures`.

## API endpoints (global)

Blueprints are **global**; no project ID is required. Same JWT auth as other operator-level routes (see [Authentication](Authentication.md)). The API uses **path-based** routes by kind.

| Method | Endpoint                     | Description                                                         |
| ------ | ---------------------------- | ------------------------------------------------------------------- |
| GET    | `/blueprints/projects`       | List project blueprints. Returns `{ blueprints }`.                  |
| GET    | `/blueprints/projects/:id`   | Get one project blueprint by id.                                    |
| POST   | `/blueprints/projects`       | Create or replace a project blueprint (body = full blueprint JSON). |
| PATCH  | `/blueprints/projects/:id`   | Update a project blueprint (partial).                               |
| DELETE | `/blueprints/projects/:id`   | Delete a project blueprint.                                         |
| GET    | `/blueprints/models`         | List model blueprints.                                              |
| GET    | `/blueprints/models/:id`     | Get one model blueprint.                                            |
| POST   | `/blueprints/models`         | Create a model blueprint.                                           |
| PATCH  | `/blueprints/models/:id`     | Update a model blueprint.                                           |
| DELETE | `/blueprints/models/:id`     | Delete a model blueprint.                                           |
| GET    | `/blueprints/structures`     | List structure blueprints.                                          |
| GET    | `/blueprints/structures/:id` | Get one structure blueprint.                                        |
| POST   | `/blueprints/structures`     | Create a structure blueprint.                                       |
| PATCH  | `/blueprints/structures/:id` | Update a structure blueprint.                                       |
| DELETE | `/blueprints/structures/:id` | Delete a structure blueprint.                                       |

Creating a project from a blueprint uses the existing **Create project** endpoint (`POST /projects`) with an optional **blueprintId** in the body (see [REST API](REST%20API.md)). The `blueprintId` must refer to a project blueprint (from `GET /blueprints/projects`). Creating a model or structure from a blueprint uses the same create endpoints with **blueprintId** (and optional overrides) in the body.

## Project creation form (Studio)

In the project creation wizard:

1. **Blueprint step:** The user selects a blueprint (or “Empty”). The list is loaded from `GET /blueprints/projects`.
2. **Later steps:** The user enters project id, label, etc.
3. **Submit:** The client calls `POST /projects` with project data and the selected **blueprintId** (or omits it for no template). The backend creates the project and, when **blueprintId** is set, applies the blueprint’s template from `data/blueprints/projects/`.

Blueprint management in Studio is under the global **Blueprints** area (e.g. `/blueprints`), not under a project.

## Relationship to core structures

**Core structures** (e.g. in `data/core/structures/`) are the engine’s built-in, read-only structure definitions (e.g. source, audit, seo). **Structure blueprints** are user-defined templates in `data/blueprints/`; instantiating one creates a **project-level** structure, just like when a project blueprint’s `template.structures` is applied. Core = built-in types; structure blueprints = reusable templates that create project structures.

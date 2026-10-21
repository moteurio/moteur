# Embedded core API (`@moteurio/core`)

Most integrations should use **[`@moteurio/client`](../packages/client/README.md)** against the **REST API**. The embedded API is for **in-process** use: the API server, CLI, tests, and monorepo tooling that already run in the same Node process as the engine.

---

## Entry point

Import the default **`Moteur`** object from `@moteurio/core`. Its shape is defined in [`packages/core/src/MoteurAPI.ts`](../packages/core/src/MoteurAPI.ts) and assembled in [`packages/core/src/index.ts`](../packages/core/src/index.ts).

```ts
import Moteur from '@moteurio/core';

const { projects } = await Moteur.projects.list(user);
```

Every method takes a **`User`** (or derives access from one) the same way the HTTP layer does after JWT validation.

---

## Namespaces on `Moteur`

| Property          | Responsibility                                                    |
| ----------------- | ----------------------------------------------------------------- |
| `projects`        | Projects CRUD, members, trash, git branches                       |
| `templates`       | Page templates                                                    |
| `pages`           | Page tree (static, collection, folder)                            |
| `layouts`         | Layout documents and blocks                                       |
| `structures`      | Reusable structure schemas                                        |
| `blocks`          | Block schema registry (built-ins, `data/core`, project overrides) |
| `collections`     | API collection definitions (public channel config)                |
| `navigations`     | Menus and resolution                                              |
| `projectApiKey`   | Create, rotate, verify project API keys                           |
| `assets`          | Upload, variants, adapters, migration                             |
| `webhooks`        | Outbound webhooks and delivery log                                |
| `forms`           | Form definitions                                                  |
| `formSubmissions` | Submission storage                                                |
| `schedules`       | Scheduled publish / unpublish                                     |
| `activity`        | Global and per-project activity logs                              |
| `comments`        | Entry/layout comments                                             |
| `reviews`         | Draft → review workflow                                           |
| `notifications`   | In-app notifications                                              |

Additional exports (not on `Moteur`): `storageConfig`, `validateStorageConfig`, `runSeed`, git helpers, search record builders, plugin registration (`registerCorePlugins`, `registerHostPlugins`), and field/block registries (side-effect import via `@moteurio/core`).

---

## Storage layout

Paths resolve from **`DATA_ROOT`** (see [Configuration](Configuration.md)): `data/projects/`, `data/blueprints/`, `data/users.json`, optional `data/core/blocks/`, per-project `.moteur/` and `user-data/`.

Built-in block and structure schemas ship in code ([`packages/core/src/plugins/builtinContent.ts`](../packages/core/src/plugins/builtinContent.ts)); files under `data/core/` override the same type ids.

---

## When to use this vs HTTP

| Use embedded `@moteurio/core`                | Use `@moteurio/client` + REST             |
| -------------------------------------------- | ----------------------------------------- |
| Implementing the API or CLI inside this repo | Frontend, SSG, external services          |
| Unit/integration tests against the engine    | Anything across the network               |
| One-off scripts with direct file access      | Production apps (versioned HTTP contract) |

Package README: [`packages/core/README.md`](../packages/core/README.md).

# @moteurio/types

Shared **TypeScript types** for Moteur: JSON shapes for projects, models, entries, pages, assets, webhooks, blueprints, and related APIs. This package is the **contract layer** between server, CLI, client, and plugins—not a runtime validator.

## What this package is not

- **Not validation logic.** [`@moteurio/core`](https://github.com/moteurio/moteur/tree/main/packages/core) (and field validators) enforce rules at save time. Types here describe the intended shape.
- **Not OpenAPI.** The HTTP API may document overlapping shapes; this package is the source for TypeScript consumers.

## Imports

**Barrel (recommended for app code):**

```ts
import type { ProjectSchema, Entry, OPERATOR_ROLE_SLUG } from '@moteurio/types';
```

**Subpath (same modules; useful to avoid pulling the whole barrel in bundles):**

```ts
import type { PresenceUpdate } from '@moteurio/types/Presence';
```

`package.json` exports `"."` and `"./*"`, so both styles work.

## Naming conventions (informal)

| Pattern              | Examples                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `*Schema`            | Persisted or versioned definitions: `ModelSchema`, `ProjectSchema`, `BlueprintSchema`, `FormSchema`, `BlockSchema`, `FieldSchema` |
| Plain noun           | Instances or wire objects: `Entry`, `User`, `Layout`, `Block`, `Comment`                                                          |
| `*Input`, `*Options` | Create/patch payloads and list filters: `CommentInput`, `CreateScheduleInput`                                                     |
| `type` aliases       | Often used for unions and lightweight shapes, e.g. in [`Webhook.ts`](./src/Webhook.ts)                                            |

Renaming published types is a **semver-major** change for consumers; prefer additive fields and optional properties when evolving.

## Platform operator role

[`OPERATOR_ROLE_SLUG`](./src/platformRoles.ts) is the string stored in JWT / `User.roles` for **platform operators** (full project list, blueprints, seed, usage, etc.). The value is `'admin'` for historical reasons; treat it as the operator role in code and docs.

## Internal conventions

- Relative imports between files in `src/` use the **`.js` extension** in the import path (TypeScript resolves them to the `.ts` sources; emitted JS stays correct for ESM). The package build (`pnpm run build`) must succeed after changes; there is no ESLint rule for this (esquery selector regex limits), so rely on review and CI.
- [`Field.ts`](./src/Field.ts) exports small **runtime** helpers (`fieldSchema`, etc.) alongside types; most files are types-only.

## Versioning

Published versions follow semver. Breaking changes to exported type names or required fields should bump **major** (or minor if you only add optional fields / new exports).

## Tests

[`tests/`](./tests/) contains compile-time style checks (e.g. discriminated unions) via Vitest `expectTypeOf`. There is no heavy runtime test suite—types are checked by consumers’ `tsc` and by the monorepo build.

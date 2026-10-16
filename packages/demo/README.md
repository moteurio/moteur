# @moteurio/demo

Builds Moteur's demo projects from source, through core's own services, so they always match
the current engine and come with real history (revisions, publish commits, reviews, comments,
schedules).

| Project            | Id         | What it is for                                                                                                                                                                                                                                           |
| ------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Moteur Journal** | `demo`     | The showcase every starter renders: the bilingual magazine of Moteur Industries, a fictional Montréal robotics company (1968–1978). ~150 entries, 11 models using every core field type, every workflow state, generated artwork. All entries are valid. |
| **Fixtures**       | `fixtures` | Edge cases for testing the Studio and API: every field type empty and full, five locales (incl. Arabic and Japanese), extreme sizes, broken references, legacy formats, unreadable files. Some entries are invalid on purpose.                           |
| **Scale**          | `scale`    | N bulk articles (default 10,000) for performance work; a fifth edited after publishing.                                                                                                                                                                  |

## Usage

From the repository root:

```bash
pnpm demo:build                          # the Journal, into ./data (refuses to overwrite)
pnpm demo:build all --force              # Journal + fixtures; existing projects are moved to data/projects/.trash/
pnpm demo:build scale --scale 30000      # bulk project
pnpm demo:build journal --password secret --asset-base-url http://localhost:3000
```

| Option                   | Default                                             |                                                                                                                                                              |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--out <dir>`            | repo root                                           | Data root to build into (the directory that contains `data/`).                                                                                               |
| `--force`                | off                                                 | Set existing projects aside instead of refusing.                                                                                                             |
| `--password <pw>`        | `MOTEUR_DEMO_PASSWORD`                              | Lets the demo team sign in (`louise@moteur-journal.test` is an admin, `celeste@…` a reviewer, the others editors). Without it, they exist but can't sign in. |
| `--asset-base-url <url>` | `STATIC_ASSETS_BASE_URL` or `http://localhost:3000` | Base URL written into media URLs. Use your API's address.                                                                                                    |
| `--scale <n>`            | 10000                                               | Entries in the scale project.                                                                                                                                |

Requires core's block and structure definitions in `data/core/` (from `@moteurio/plugin-core-blocks`).
Host plugins listed in `MOTEUR_HOST_PLUGINS` (e.g. geo fields) are loaded like the API does.

## How it works

- `src/journal/content/` holds the Journal's content as TypeScript: prose in a small markup
  (`**bold**`, lists, quotes… see `src/runtime/dast.ts`), converted to the stored format by each
  field's type. Images are referenced as `{ art: 'key' }` and generated in `src/journal/art.ts`.
- Each source entry declares its end state (`published`, `edited`, `in-review`, `rejected`,
  `scheduled`…). `src/runtime/workflow.ts` plays every entry's history on one timeline, oldest
  action first, with a simulated clock (`src/runtime/clock.ts`), so dates and git history span
  the months before the build.
- After building, every entry is validated like an API save. The Journal must have no invalid
  entry; the fixtures must match the list in `src/fixtures/content.ts` (`EXPECTED_INVALID`).

## Adding content

Add an entry to the matching file in `src/journal/content/`, run `pnpm demo:build journal --force`,
and check the summary says `0 invalid`. New images go in `src/journal/art.ts`.

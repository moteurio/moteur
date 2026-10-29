# Local setup

From a fresh clone to a running API with real content, then the commands you'll use every day.

## What you need

- **Node 22 or 24** (CI tests both).
- **pnpm 11** (`npm install -g pnpm`).
- **git** on your `PATH`: the engine runs it to keep each project's history.

## First run

```bash
git clone https://github.com/moteurio/moteur.git
cd moteur
pnpm install          # also installs the git hooks
pnpm build
```

Create a `.env` at the repo root. The API reads it on start. The one value you must set is `JWT_SECRET`:

```bash
JWT_SECRET=any-long-random-string-for-local-use
PORT=3000
```

Every other setting has a default; [Configuration](../Configuration.md) lists them all.

Then fill the data folder with something to work on, and start the server:

```bash
pnpm demo:build --password secret    # the Moteur Journal demo project, into ./data
pnpm server:dev                      # the API from source, on http://localhost:3000
```

Open `http://localhost:3000/docs` for the interactive API reference. Sign in as `louise@moteur-journal.test` with password `secret`: she is an admin of the demo project.

To start from an empty folder instead, create your own account with `pnpm cli -- auth create-user`.

## Where the data goes

Without `DATA_ROOT`, the engine keeps everything under `data/` at the repo root (it is gitignored):

```text
data/
├── users.json          accounts
├── operators.json      the people who run the server, once there are any
├── projects/<id>/      one folder per project, each its own git repository
├── blueprints/
└── metering/
```

You can open, read and even edit these files by hand while the server runs. The content index notices within 30 s. To start over, stop the server and delete `data/`, or rebuild the demo with `pnpm demo:build all --force` (old projects are moved to `data/projects/.trash/`).

## Every day

| Task                         | Command                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| Run the API                  | `pnpm server:dev` (restart it after changes)                 |
| Build everything             | `pnpm build`                                                 |
| All tests                    | `pnpm test`                                                  |
| One package's tests          | `pnpm --filter @moteurio/core test`                          |
| One test file                | `pnpm --filter @moteurio/core exec vitest run tests/entries` |
| Tests while you work         | `pnpm --filter @moteurio/core exec vitest`                   |
| Lint and fix formatting      | `pnpm lint:fix`                                              |
| Use the CLI against your API | `pnpm cli -- <command>` (see [CLI](../CLI.md))               |
| Export the OpenAPI document  | `pnpm openapi:export`                                        |

Packages import each other's **built** output (`dist/`), not their source. `pnpm server:dev` runs `api` from source, but the `core` it calls is the last build. After changing `core`, run `pnpm --filter @moteurio/core build` (or `pnpm build`), then restart the server. The same goes for tests in one package that exercise another.

## What runs before your code leaves your machine

- **On commit:** lint-staged formats and lints the files you staged.
- **On push:** `pnpm check:all` (lint, build, all tests). A push that fails it doesn't go out.
- **On a pull request:** CI runs lint, build, a check that every API success response documents its body (`pnpm openapi:check`), and the tests, on Node 22 and 24.

## When something's off

- **`JWT_SECRET must be set`:** your `.env` is missing or not at the repo root.
- **Your change in `core` does nothing:** the server and other packages use `core`'s build. Rebuild it, then restart.
- **A list doesn't show a file you edited by hand:** wait for the index to re-check, or see the index rebuild in [Operations](../Operations.md).
- **Port 3000 is taken:** set `PORT` in `.env`.

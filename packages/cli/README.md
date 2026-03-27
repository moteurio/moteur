# @moteurio/cli

Command-line interface for [Moteur](https://github.com/moteurio/moteur). Connect to any Moteur API (local or remote), manage projects and content, run seed and tools—from your terminal. Built for power users: **Atelier** (interactive TUI) when you run `moteur` with no arguments, and scriptable commands with JSON import from files or stdin.

- **Atelier** = interactive terminal UI (this CLI). Run `moteur` or `moteur atelier` to open it.
- **Studio** = web admin UI (moteur-admin), for the full browser-based experience.

Uses [@moteurio/client](https://github.com/moteurio/moteur/tree/main/packages/client) under the hood. Output and tables use **Chalk** + **cli-table3**; Atelier uses **Ink** (React) for the TUI.

This package lives in the main Moteur repo: [moteurio/moteur](https://github.com/moteurio/moteur) at `packages/cli/`.

## Installation

```bash
npm install -g @moteurio/cli
# or
pnpm add -g @moteurio/cli
# or
npx @moteurio/cli
```

The `moteur` binary is available after install.

**Monorepo:** the npm `bin` points at `bin/moteur.js` (always present) so `pnpm install` can link `.bin/moteur` without errors. That script loads `./dist/index.js`; run `pnpm run build` or `pnpm --filter @moteurio/cli build` first, or use `pnpm run cli:dev` from the repo root.

## Configure and log in

Point the CLI at your Moteur API and authenticate.

1. **API URL** – Default is `http://localhost:3000`. Override with env or config:
    - `MOTEUR_API_URL=https://api.your-moteur.com`
    - Or save in config (see below).

2. **Log in** (interactive):

    ```bash
    moteur auth login
    ```

    You'll be prompted for API URL (if needed), username, and password. The token is stored in `~/.moteur/config.json` (or `%USERPROFILE%\.moteur\config.json` on Windows).

3. **Or use env / config** (e.g. for CI or scripts):
    - `MOTEUR_API_URL` – API base URL
    - `MOTEUR_TOKEN` – JWT (after login) or `MOTEUR_API_KEY` – project API key
    - Optional: `MOTEUR_PROJECT_ID` – default project

Config file: `~/.moteur/config.json` (or `MOTEUR_CONFIG_DIR`). Example:

```json
{
    "apiUrl": "https://api.your-moteur.com",
    "token": "eyJ...",
    "projectId": "my-blog"
}
```

## Atelier (interactive TUI)

Run `moteur` or `moteur atelier` with no other arguments to open **Atelier**, the interactive terminal UI:

- **Login** – API URL, email, password (or use existing config).
- **Project** – Pick a default project if you don’t have one; switch project from the sidebar.
- **Sidebar** – Content (Pages, Entries, Navigation, Layouts, Activity), Schemas (Templates, Models, Structures, Blocks), User data (Forms, Submissions), Configuration (Webhooks, Assets), Account, Projects, Quit.
- **Lists and detail** – Browse and open items; edit entries field-by-field or in `$EDITOR`; bulk select, delete, export JSON; filter with `/`.

## Commands (overview)

| Area           | Commands                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**       | `moteur auth login`, `moteur auth create-user`, `moteur auth reset-password`, `moteur auth whoami`, `moteur auth logout`, `moteur auth list --project=<id>` (shows **online** / **last login**; `--json` for full `ProjectMemberUser` rows) |
| **Projects**   | `moteur projects list`, `get`, `create`, `patch`, `delete`; set default from menu                                                                                                                                                           |
| **Models**     | `moteur models list --project=<id>`, `get`, `create`, `patch`, `delete`                                                                                                                                                                     |
| **Entries**    | `moteur entries list/get/create/patch/delete` with `--project`, `--model`                                                                                                                                                                   |
| **Content**    | `moteur templates`, `moteur pages`, `moteur layouts`, `moteur structures` (list/get/create/patch/delete)                                                                                                                                    |
| **Media**      | `moteur assets list/get/...`, `moteur forms`, `moteur webhooks`, `moteur navigations`                                                                                                                                                       |
| **Tools**      | `moteur seed` [, `--force`], `moteur radar report`, `moteur branches list/...`                                                                                                                                                              |
| **Blueprints** | `moteur blueprints list --kind=project`, `get`, `create`, ...                                                                                                                                                                               |

Use `moteur help` for the full list and `moteur help <command>` for examples (e.g. `moteur help projects`).

## JSON import and piping

Create and patch commands accept a body from:

- **File**: `--file=path/to.json`
- **Inline**: `--data='{"id":"my-blog","label":"My Blog"}'`
- **Stdin**: pipe JSON when stdin is not a TTY, e.g. `cat post.json | moteur entries create --project=my-blog --model=posts`

Examples:

```bash
moteur projects create --file=project.json
moteur entries create --project=my-blog --model=posts --file=post.json
cat patch.json | moteur projects patch --id=my-blog
```

Export: use `--json` to print the API response as JSON to stdout (e.g. for scripts).

## Script-friendly flags

- `--json` – Output raw JSON (no tables or extra text).
- `--quiet` – Minimal output.
- `--yes` or `--force` – Skip confirmation prompts (e.g. on delete).
- `--project=<id>`, `--projectId=<id>` – Project (or set default in menu).
- `--model=<id>`, `--modelId=<id>` – Model for entry commands.

## Examples

```bash
# Open Atelier (interactive TUI)
moteur
moteur atelier

# List projects (table) or JSON
moteur projects list
moteur projects list --json

# Create project from file
moteur projects create --file=project.json

# List entries for a model
moteur entries list --project=my-blog --model=posts

# Get one entry
moteur entries get --project=my-blog --model=posts --id=my-post

# Delete with confirmation (or --yes to skip)
moteur projects delete --id=old-project
moteur projects delete --id=old-project --yes

# Help and examples
moteur help
moteur help entries
```

## Releasing

See [CONTRIBUTING.md](CONTRIBUTING.md#releasing). To publish manually from the repo root:

```bash
pnpm --filter @moteurio/cli run build
cd packages/cli && npm publish --access public
```

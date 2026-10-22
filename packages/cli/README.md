# @moteurio/cli

Command-line interface for [Moteur](https://github.com/moteurio/moteur). Connect to any Moteur API (local or remote), manage projects and content, run seed and tools: scriptable commands with JSON import from files or stdin and `--json` output, for scripts, CI and agents.

For writing and reviewing content interactively, use the Studio: on the web, or in your terminal with [`@moteurio/studio-cli`](https://github.com/moteurio/moteur-studio-cli) (`moteur-studio`). For AI agents, the same commands are MCP tools: [`@moteurio/mcp`](../mcp). All share this CLI's sign-in.

Uses [@moteurio/client](https://github.com/moteurio/moteur/tree/main/packages/client) under the hood. Output and tables use **Chalk** + **cli-table3**.

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

**Monorepo:** the npm `bin` points at `bin/moteur.js` (always present) so `pnpm install` can link `.bin/moteur` without errors. That script loads `./dist/index.js`. From the repo root:

```bash
pnpm run cli:dev          # rebuilds the CLI, then runs it (Node + dist)
pnpm run cli:dev -- help  # pass args after --
```

`cli:dev` uses the compiled `dist` output. For a watch loop: `pnpm --filter @moteurio/cli exec tsc -b --watch` in one terminal and `node packages/cli/dist/index.js` in another.

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
    - Optional: `MOTEUR_PROJECT` – default project (or `moteur projects use <id>`)

Config file: `~/.moteur/config.json` (or `MOTEUR_CONFIG_DIR`). Example:

```json
{
    "apiUrl": "https://api.your-moteur.com",
    "token": "eyJ...",
    "projectId": "my-blog"
}
```

## Commands

Every group of the Studio has its commands, named as the Studio names things: `entries`, `models`, `reviews`, `schedules`, `comments`, `pages`, `site`, `menus`, `media`, `templates`, `layouts`, `structures`, `blocks`, `forms`, `submissions`, `members`, `invites`, `keys`, `channels`, `webhooks`, `branches`, `ai`, `billing`, `operator` and more. `moteur help` lists them; `moteur <group> --help` and `moteur <group> <command> --help` explain each, with the API call it makes. The full reference is [docs/CLI.md](../../docs/CLI.md).

```bash
moteur projects use demo                       # the default project for every command
moteur entries list article --q glace --status published
moteur entries create article --id glace --set title.fr="Sous la glace"
moteur entries update article glace --set title.en="Under the ice"
moteur entries publish article glace
moteur reviews list --status pending
moteur reviews approve <review-id>
moteur schedules create publish glace --model article --at 2026-11-13T09:00:00-05:00
moteur media upload covers/*.jpg --folder covers
moteur media update <file-id> --alt "Under the ice" --lang en
moteur invites send someone@example.com --roles writer
```

Anything the API does that has no command yet (or that a plugin adds): `moteur api <METHOD> <path>`, signed in, with `{project}` filled in.

```bash
moteur api GET /projects/{project}/usage
moteur api POST /projects/{project}/notifications/read-all
```

## Input and output

- **Arguments**: `--key value` or `--key=value`; the thing a command is about can come first (`moteur entries get article glace`). Unknown options are refused, with a suggestion.
- **Fields**: `--set field=value`, repeated; dots go inside (`title.en=…`), values are read as JSON when they are (`readingTime=5`, `tags='["a","b"]'`).
- **JSON bodies**: `--file=path.json`, `--data='{…}'`, or piped on stdin.
- **Output**: a table or a sentence for people; `--json` prints the API’s whole answer for scripts. `--quiet` prints nothing but errors; `--plain` (or `NO_COLOR`) drops colour.
- **Changes that can’t be undone** ask first; `--yes` skips the question (required when not in a terminal).
- **Exit codes**: 0 done, 1 the API refused or failed, 2 the command was used wrongly.

## Keeping up with the engine

Commands are declared in [@moteurio/commands](../commands) (arguments, and the call each makes), which the [MCP server](../mcp) shares. `pnpm --filter @moteurio/commands coverage` checks every API operation has one; `pnpm docs` here rewrites [docs/CLI.md](../../docs/CLI.md) from them.

## Releasing

See [CONTRIBUTING.md](CONTRIBUTING.md#releasing). To publish manually from the repo root:

```bash
pnpm --filter @moteurio/cli run build
cd packages/cli && npm publish --access public
```

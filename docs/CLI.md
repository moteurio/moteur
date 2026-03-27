# 🧭 Moteur CLI Reference

The Moteur CLI allows you to manage projects, layouts, structures, blocks, and fields via the terminal.

---

## Installed CLI (`moteur` on your PATH)

When you install **`@moteurio/cli`** from npm (or another registry), the **`moteur`** binary is on your PATH:

```bash
pnpm add -g @moteurio/cli
# or: npm install -g @moteurio/cli

moteur projects list
moteur auth login
```

- Run **`moteur`** or **`moteur atelier`** with no further arguments to open **Atelier**, the interactive TUI (Ink/React). Same flow as below for global flags and subcommands.
- Package README with more detail: [`packages/cli/README.md`](../packages/cli/README.md).

## From the Moteur monorepo

> To run a command, use `pnpm run cli -- command subcommand -- --flags` (or `npm run cli -- command subcommand -- --flags`). Notice the extra `--` before flags.
> In dev mode: `pnpm run cli:dev -- command subcommand -- --flags`

> Run without command or subcommand to open **Atelier** (interactive TUI), same as the published CLI.

## 🔧 Global Flags

| Flag               | Description                       |
| ------------------ | --------------------------------- |
| `--json`           | Output results as raw JSON        |
| `--quiet`          | Suppress all output except errors |
| `--file=path.json` | Load full input from a JSON file  |
| `--data='{...}'`   | Provide inline JSON as input      |

> Note that setting `--json` will force quiet mode

> Note that only one of `file` or `data` is permitted. Scripts are expected to break if both are passed to a single command at the same time.

---

## 🔐 Auth

| Command                     | Description                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `auth login`                | Log in and save JWT token                                                                                                     |
| `auth logout`               | Log out and remove JWT token                                                                                                  |
| `auth create-user`          | Create a new user (interactive; no login required)                                                                            |
| `auth reset-password`       | Reset a user password in local `users.json` (no API login; `--user=` id or email)                                             |
| `auth list`                 | List all users and their roles/permissions (operator only)                                                                    |
| `auth list --json`          | List users as JSON (operator only)                                                                                            |
| `auth list --quiet`         | Suppress human-readable output                                                                                                |
| `auth list --project=site1` | List project members via API (JWT); plain output includes **online** / **last login**; `--json` returns `ProjectMemberUser[]` |

---

## 📁 Projects

| Command                                  | Description                               |
| ---------------------------------------- | ----------------------------------------- |
| `projects list`                          | List all available projects               |
| `projects get --id=site1`                | Show details of a specific project        |
| `projects create`                        | Create a new project (interactive)        |
| `projects create --file=myproject.json`  | Create a new project (from JSON file)     |
| `projects create --data={...}`           | Create a new project (from inline data)   |
| `projects patch --id=site1`              | Patch existing project (interactive)      |
| `projects patch --id=site1 --file`       | Patch existing project (from JSON file)   |
| `projects patch --id=site1 --data={...}` | Patch existing project (from inline data) |
| `projects delete --id=site1`             | Move a project to the trash               |

---

## 📄 Layouts

| Command                                              | Description                  |
| ---------------------------------------------------- | ---------------------------- | ------------------------ |
| `layouts list --project=site1`                       | List layouts in a project    |
| `layouts get --project=site1 --id=homepage`          | Show the full layout content |
| `layouts create --project=site1 [--file              | --data]`                     | Create a new layout      |
| `layouts patch --project=site1 --id=homepage [--file | --data]`                     | Patch an existing layout |
| `layouts delete --project=site1 --id=homepage`       | Move a layout to the trash   |

---

## 🧱 Structures

| Command                                                        | Description                                |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `structures list --project=site1`                              | List available structures (global + local) |
| `structures get --project=site1 --id=core/teamMember`          | Get a structure definition                 |
| `structures create --project=site1 [--file                     | --data]`                                   | Create a structure in a project |
| `structures patch --project=site1 --id=core/teamMember [--file | --data]`                                   | Patch a structure               |
| `structures delete --project=site1 --id=core/teamMember`       | Move a structure to the trash              |

---

## 🗂️ Models

| Command                                                        | Description                                  |
| -------------------------------------------------------------- | -------------------------------------------- |
| `models list --project=site1`                                  | List model schemas in a project              |
| `models get --project=site1 --id=article`                      | Show the full model schema                   |
| `models create --project=site1`                                | Create a new model schema (interactive)      |
| `models create --project=site1 --file=path.json`               | Create a new model schema (from JSON file)   |
| `models create --project=site1 --data={...}`                   | Create a new model schema (from inline data) |
| `models patch --project=site1 --id=article [--file \| --data]` | Patch an existing model schema               |
| `models delete --project=site1 --id=article`                   | Move a model schema to the trash             |

---

## 📜 Entries

| Command                                                                          | Description                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `entries list --project=site1 --model=article`                                   | List entries of a specific model                |
| `entries get --project=site1 --model=article --id=entry123`                      | Show the full entry data                        |
| `entries create --project=site1 --model=article [--file \| --data]`              | Create a new entry                              |
| `entries patch --project=site1 --model=article --id=entry123 [--file \| --data]` | Patch an existing entry                         |
| `entries delete --project=site1 --model=article --id=entry123`                   | Move an entry to the trash                      |
| `entries validate --project=site1 --model=article --id=entry123`                 | Validate a single entry                         |
| `entries validate --project=site1 --model=article`                               | Validate all entries in a model                 |
| `entries validate --project=site1`                                               | Validate all entries in all models of a project |

---

## 🗒 Forms

| Command                                                      | Description                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `forms list --project=site1`                                 | List all forms in a project                                               |
| `forms list --project=site1 --json`                          | Output as raw JSON                                                        |
| `forms get --project=site1 --id=contact`                     | Get one form (full schema)                                                |
| `forms create --project=site1`                               | Create a form (interactive, basic info only)                              |
| `forms create --project=site1 --file=form.json`              | Create from JSON file (supports full schema incl. actions, notifications) |
| `forms create --project=site1 --data={...}`                  | Create from inline JSON                                                   |
| `forms patch --project=site1 --id=contact`                   | Patch a form (interactive)                                                |
| `forms patch --project=site1 --id=contact --file=patch.json` | Patch from file                                                           |
| `forms patch --project=site1 --id=contact --data={...}`      | Patch from inline JSON                                                    |
| `forms delete --project=site1 --id=contact`                  | Soft-delete a form                                                        |

---

## 📥 Submissions

| Command                                                                             | Description                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `submissions list --project=site1 --form=contact`                                   | List submissions for a form                                                    |
| `submissions list --project=site1 --form=contact --status=spam`                     | Filter by status (received \| processed \| spam)                               |
| `submissions list --project=site1 --form=contact --limit=20`                        | Limit results                                                                  |
| `submissions list --project=site1 --form=contact --json`                            | Output as raw JSON                                                             |
| `submissions get --project=site1 --form=contact --id=sub123`                        | Get one submission (full detail)                                               |
| `submissions delete --project=site1 --form=contact --id=sub123`                     | Permanently delete a submission (hard delete; deletion is logged to activity). |
| `submissions export --project=site1 --form=contact --format=csv`                    | Export all submissions to CSV                                                  |
| `submissions export --project=site1 --form=contact --format=json`                   | Export all submissions to JSON                                                 |
| `submissions export --project=site1 --form=contact --format=csv --output=subs.csv`  | Export to a specific file path                                                 |
| `submissions export --project=site1 --form=contact --format=csv --status=processed` | Export filtered by status                                                      |
| `submissions export --project=site1 --form=contact --format=json --limit=100`       | Export with limit                                                              |

---

## 📄 Templates

| Command                                                                | Description                           |
| ---------------------------------------------------------------------- | ------------------------------------- |
| `templates list --project=site1`                                       | List templates in a project           |
| `templates get --project=site1 --id=landing-page`                      | Show the full template schema         |
| `templates create --project=site1 [--file \| --data]`                  | Create a new template                 |
| `templates patch --project=site1 --id=landing-page [--file \| --data]` | Patch an existing template            |
| `templates delete --project=site1 --id=landing-page`                   | Move a template to the trash          |
| `templates validate --project=site1`                                   | Validate all templates in the project |
| `templates validate --project=site1 --id=landing-page`                 | Validate a single template            |

---

## 📃 Pages

Pages are a typed tree: **static** (authored content), **collection** (bound to a model), **folder** (structure only). Use `--project=...` or `--projectId=...`.

| Command                                                                                                        | Description                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pages list --project=site1`                                                                                   | List all page nodes (flat)                                   |
| `pages list --project=site1 --type=collection`                                                                 | List only collection pages                                   |
| `pages list --project=site1 --template=landing-page`                                                           | List pages for a template                                    |
| `pages list --project=site1 --parent=home`                                                                     | List child pages of a parent                                 |
| `pages get --project=site1 --id=page123`                                                                       | Show the full page node                                      |
| `pages get --project=site1 --slug=about-us`                                                                    | Show page by slug                                            |
| `pages create --project=site1 --type=static --label="About" --slug=about --template=standard-page`             | Create a static page                                         |
| `pages create --project=site1 --type=collection --label="Blog" --slug=blog --template=blog-index --model=post` | Create a collection page                                     |
| `pages create --project=site1 --type=folder --label="Products" --slug=products`                                | Create a folder node                                         |
| `pages create --project=site1 [--file \| --data]`                                                              | Create from JSON (include type, label, slug)                 |
| `pages patch --project=site1 --id=page123 [--file \| --data]`                                                  | Patch an existing page                                       |
| `pages patch --project=site1 --id=page123 --nav-include=false`                                                 | e.g. exclude from navigation                                 |
| `pages delete --project=site1 --id=page123`                                                                    | Move a page to the trash (fails with 409 if it has children) |
| `pages urls --project=site1`                                                                                   | Print all resolved URLs (JSON with --json)                   |
| `pages urls --project=site1 --sitemap`                                                                         | Print sitemap XML to stdout                                  |
| `pages validate --project=site1`                                                                               | Validate all pages in the project                            |
| `pages validate --project=site1 --id=page123`                                                                  | Validate a single page                                       |

---

## 🧭 Navigations

Navigations are named, ordered, nested menus (e.g. Header, Footer). Items can link to pages, custom URLs, assets, or act as dropdown parents. Use `--project=...` or `--projectId=...`.

| Command                                                              | Description                                   |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `navigations list --project=site1`                                   | List all navigations                          |
| `navigations get --project=site1 --id=abc123`                        | Get a navigation by id                        |
| `navigations get --project=site1 --handle=header`                    | Get a navigation by handle                    |
| `navigations create --project=site1 --name="Header" --handle=header` | Create a navigation (optional `--maxDepth=3`) |
| `navigations delete --project=site1 --id=abc123`                     | Delete a navigation                           |

---

## 💬 Comments

| Command                                                                                           | Description                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `comments list --project=site1 --resource-type=entry --resource-id=article__e1`                   | List comments for a resource (entry or layout)        |
| `comments list ... --field-path=hero.title`                                                       | Filter by field path (optional)                       |
| `comments list ... --include-resolved=true`                                                       | Include resolved comments (default: unresolved only)  |
| `comments add --project=site1 --resource-type=entry --resource-id=article__e1 --body="Your text"` | Add a comment                                         |
| `comments add ... --field-path=hero.title`                                                        | Attach comment to a specific field (optional)         |
| `comments add ... --block-id=block-1`                                                             | Attach to a layout block (optional)                   |
| `comments add ... --parent-id=<comment-id>`                                                       | Add a reply (one level only; optional)                |
| `comments add ... [--file \| --data]`                                                             | Provide body via JSON file or inline JSON with `body` |
| `comments resolve --project=site1 --id=<comment-id>`                                              | Mark a comment as resolved                            |
| `comments delete --project=site1 --id=<comment-id>`                                               | Delete a comment (author or operator only)            |
| `comments edit --project=site1 --id=<comment-id> --body="New text"`                               | Edit comment body (author only)                       |
| `comments edit ... [--file \| --data]`                                                            | Provide new body via JSON with `body`                 |

Use `--json` on list/add/resolve/edit for raw JSON output. `--project` can be omitted to pick from an interactive project list.

---

## 📁 Assets

| Command                                          | Description                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets list --project=site1`                    | List project assets. Optional: `--type=image`, `--folder=/press`, `--json`.                                                                                                                                                     |
| `assets get --project=site1 --id=abc123`         | Show a single asset. `--json` for raw output.                                                                                                                                                                                   |
| `assets delete --project=site1 --id=abc123`      | Delete an asset (does not cascade to entries).                                                                                                                                                                                  |
| `assets regenerate --project=site1`              | Regenerate image variants for all images. Optional: `--id=abc --id=def` for specific assets.                                                                                                                                    |
| `assets config --project=site1`                  | Show asset config (variants, adapter; secrets redacted). `--json` for raw.                                                                                                                                                      |
| `assets config --project=site1 --set-adapter=s3` | Set storage adapter (e.g. `local`, `s3`, `r2`).                                                                                                                                                                                 |
| `assets migrate-provider --to=vimeo`             | Migrate videos to a provider (instance-wide). Required: `--to` (`mux` \| `vimeo` \| `local`). Optional: `--from=mux`, `--project=site1` (or multiple `--project`), `--keepLocalCopy`. Returns `{ processed, errors, skipped }`. |

---

## 🔗 Webhooks

Outbound webhooks notify external systems when content events occur (entry published, asset deleted, review approved, etc.). Use `--project=...` or `--projectId=...`.

| Command                                                                                     | Description                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhooks list --project=site1`                                                             | List all webhooks (secrets redacted).                                                                                                                                  |
| `webhooks get --project=site1 --id=abc123`                                                  | Get one webhook by id.                                                                                                                                                 |
| `webhooks create --project=site1 --name="Vercel deploy" --url=https://api.example.com/hook` | Create a webhook. Optional: `--secret=...`, `--events=entry.published,entry.deleted` (comma-separated), `--enabled=false`. Secret is generated if omitted; shown once. |
| `webhooks update --project=site1 --id=abc123 --enabled=false`                               | Update a webhook. Optional: `--name`, `--url`, `--enabled`.                                                                                                            |
| `webhooks delete --project=site1 --id=abc123`                                               | Delete a webhook.                                                                                                                                                      |
| `webhooks rotate-secret --project=site1 --id=abc123`                                        | Rotate the webhook secret. New secret is shown once.                                                                                                                   |
| `webhooks test --project=site1 --id=abc123`                                                 | Send a test ping (fake payload). Returns delivery result.                                                                                                              |
| `webhooks log --project=site1 --id=abc123 --limit=20`                                       | Show delivery log for a webhook. Optional: `--limit` (default 20).                                                                                                     |
| `webhooks retry --project=site1 --id=abc123 --deliveryId=delivery-uuid`                     | Retry a failed delivery.                                                                                                                                               |

Use `--json` on list/get/create/update/test/log for raw JSON output.

---

## 📂 Workspace

Snapshot and restore the workspace (`.moteur/`: activity, comments, reviews, schedules, etc.) to/from an orphan Git branch. Use `--project=...` or `--projectId=...`.

| Command                              | Description                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace snapshot --project=site1` | Snapshot `.moteur/` to branch `moteur-workspace-snapshots`. Optional: `--message="..."`, `--push` to push the snapshot branch.                                       |
| `workspace restore --project=site1`  | Restore `.moteur/` from the snapshot branch. Optional: `--from=moteur-workspace-snapshots`. Restore merges into existing files; it does not delete local-only files. |

---

## 🌿 Branches (content)

List, create, switch, and merge Git branches for content. Use `--project=...` or `--projectId=...`.

| Command                                              | Description                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `branches list --project=site1`                      | List content branches (current branch marked with `*`). Optional: `--all` to include the workspace snapshot branch. |
| `branches create --project=site1 --name=feature/x`   | Create a new branch. Optional: `--from=HEAD` (default) or another ref.                                              |
| `branches switch --project=site1 --branch=feature/x` | Switch the working tree to the given branch.                                                                        |
| `branches merge --project=site1 --source=feature/x`  | Merge the given branch into the current branch.                                                                     |

---

## 👤 Userdata

Permanently delete form submissions (hard delete; deletion is logged to activity). Use `--project=...`, `--form=...`, `--id=...`. Prompts for confirmation unless `--yes` is set.

| Command                                                      | Description                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `userdata delete --project=site1 --form=contact --id=sub123` | Permanently delete the submission. Use `--yes` to skip the confirmation prompt. |

---

## 🧩 Fields & 📦 Blocks

Field and block type listings are available from the **interactive CLI menu** (run the CLI without a command). Top-level `fields list` and `blocks list` commands are not currently registered; use the menu, [`@moteurio/client`](../packages/client/README.md), or in-process `@moteurio/core` (see [Embedded core API](Developer%20API.md)).

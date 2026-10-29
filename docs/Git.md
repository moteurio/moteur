# Git integration

Moteur stores project content on disk and uses Git for history. Workspace and user data live in gitignored directories and can be snapshotted to separate orphan branches.

---

## What is tracked on the main branch

**Content** (committed on every save):

- `project.json`, `models/`, `layouts/`, `pages/`, `templates/`, `structures/`, `navigations.json`, `forms/`, `channels.json`, `webhooks.json`, `assets.json`, etc.

All of these are under the project directory. Every content save or delete triggers a commit (and optional push) when the project is a Git repository.

**Schema history:** Models, structures, templates, forms, and project block JSON files are part of this tree. Each schema save is a commit you can list and restore via the revisions API or Studio **History** tab. See [Schema revisions](Schema%20revisions.md).

**Read-only history API:** `GET /projects/:projectId/git/log?path=<relative-path>` returns commits for one file (or omit `path` for the whole repo). Schema-specific routes are documented in [Schema revisions](Schema%20revisions.md).

---

## What is never committed on the main branch

These paths are in `.gitignore` and **must not** be committed to the main content branch:

| Path         | Purpose                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `.moteur/`   | Workspace data: activity log, comments, reviews, notifications, webhook log, Radar, schedules, presence, snapshot schedule config. |
| `user-data/` | User data: form submissions.                                                                                                       |
| `.trash/`    | Trashed projects and content.                                                                                                      |

New projects get `.gitignore` written (or merged) so `.moteur/`, `user-data/`, and `.trash/` are present. They are created and initialised with empty defaults when a project is created.

---

## When commits and push happen

- **Commit**: After each content save or delete, the Git plugin commits the changed paths. Commit author is taken from the user performing the action. Failures (e.g. not a repo, merge conflict) do not fail the save; they are best-effort.
- **Push**: After each commit, the API pushes to the project's Git address (`project.git.remoteUrl`, the `origin` remote). A branch never pushed gets its upstream on the first push. Push failures are non-fatal and do not block the request: they are logged as `git_push_failed` activity. Without an address, the history stays on the server and nothing is pushed.

### The Git address

The address must be `https://` and must not contain a password or token: it is saved in `project.json`, which every save commits and pushes. For a private repository, a developer gives the project an access token: `PUT /projects/:projectId/git/token` with `{ token, username? }`, or the Studio's Setup › Project › Git. Use a token that can write to that one repository (GitHub: a fine-grained token with Contents read and write; GitLab: a project access token; Bitbucket: a repository access token with the user name `x-token-auth`). The token is kept in the gitignored `.moteur/secrets.json`, encrypted with `MOTEUR_ENCRYPTION_KEY` (required in production), never in a snapshot, and never returned: the status only says `token.hasToken` and when it was set. It reaches Git only during a push, as an `Authorization` header passed through the environment, never in the address or the repository's config. `DELETE /projects/:projectId/git/token` removes it. Without a token, the server pushes with whatever Git credentials its host has.

`GET /projects/:projectId/git/status` says where things stand: the `branch`, the `lastCommit`, the `remoteUrl` (any credentials Git holds are left out), and `unpushed`, the number of commits the address lacks. A number that keeps growing means pushes fail. Developers can push at once with `POST /projects/:projectId/git/push`, which answers `pushed` and the status after. The Studio shows both under Setup › Project › Git; the CLI has `moteur branches status` and `moteur branches push`.

---

## Content branches (V2)

You can work with Git branches for content:

- **List branches**: API `GET /projects/:projectId/branches` or CLI `moteur branches list --project=...`
- **Create branch**: API `POST /projects/:projectId/branches` with `{ "name": "feature/x", "from": "HEAD" }` or CLI `moteur branches create --project=... --name=feature/x [--from=main]`
- **Switch branch**: API `POST /projects/:projectId/branches/switch` with `{ "branch": "feature/x" }` or CLI `moteur branches switch --project=... --branch=feature/x`
- **Merge**: API `POST /projects/:projectId/branches/merge` with `{ "sourceBranch": "feature/x" }` or CLI `moteur branches merge --project=... --source=feature/x`

The current branch is returned by the branches list endpoint and is used for all content commits until you switch.

---

## Workspace and user-data snapshots

Workspace (`.moteur/`) and user data (`user-data/`) are stored in **separate orphan branches** so they are never mixed with content history:

| Branch                       | Contents                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `moteur-workspace-snapshots` | Snapshot of `.moteur/` only. **`secrets.json` is never included** in any snapshot commit. |
| `moteur-userdata-snapshots`  | Snapshot of `user-data/` only.                                                            |

- **Snapshot workspace**: programmatically, `SnapshotService.snapshotWorkspace(projectId, message, user)` (no API route, so no CLI command yet).
- **Snapshot user data**: Programmatically `SnapshotService.snapshotUserData(projectId, message, user)` (CLI can be added similarly).
- **Restore workspace**: programmatically, `SnapshotService.restoreWorkspace(projectId, fromBranch)` (no API route, so no CLI command yet). Restore **merges** snapshot contents into the existing `.moteur/` directory; it does not delete files that exist only locally and are absent from the snapshot.
- **Restore user data**: `SnapshotService.restoreUserData(projectId, fromBranch)`. Same merge behaviour: existing files not in the snapshot are left in place.

**Important:** Do not trigger CI on snapshot branch pushes. Document this in your CI config or README so that pipelines ignore `moteur-workspace-snapshots` and `moteur-userdata-snapshots`.

---

## Snapshot scheduler

The API can run an **in-process** snapshot scheduler (no external cron required):

- It runs on a configurable interval (e.g. every 60 seconds) and checks each project for a snapshot schedule.
- Per-project config: `.moteur/snapshot-schedule.json` with `{ "enabled": true, "cron": "0 * * * *" }` (e.g. hourly). If `enabled` is `false` or the file is missing, no scheduled snapshots run for that project.
- When the cron expression matches the current time, it runs `snapshotWorkspace` and `snapshotUserData` asynchronously; they do not block Studio or other API requests.

---

## Initialisation

- **New project**: If you create a project with no Git remote, `git init` is run and `.gitignore` is written. If you set `project.git.remoteUrl`, the project is cloned from the remote and `.gitignore` is merged in.
- **`.moteur/` and `user-data/`**: Created and filled with empty defaults (e.g. `activity.json`, `comments.json`, `user-data/forms/`) when the project is created.

---

## Summary

| Topic                       | Detail                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Content                     | Tracked on main (or current) branch; commit on every save; optional push.                    |
| `.moteur/` and `user-data/` | Gitignored; never committed to content branch.                                               |
| Snapshots                   | Orphan branches; workspace and user data are separate; `secrets.json` never in snapshots.    |
| Restore                     | Merge snapshot into existing dir; does not delete extra local files.                         |
| Branches                    | List, create, switch, merge via API and CLI.                                                 |
| Scheduler                   | In-process; per-project `enabled` and `cron` in `.moteur/snapshot-schedule.json`.            |
| Schema revisions            | Git log per schema file; stable id = commit hash. [Schema revisions](Schema%20revisions.md). |

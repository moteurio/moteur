# Git integration

Moteur stores project content on disk and uses Git for history. Workspace and user data live in gitignored directories and can be snapshotted to separate orphan branches.

---

## What is tracked on the main branch

**Content** (committed on every save):

- `project.json`, `models/`, `layouts/`, `pages/`, `templates/`, `structures/`, `navigations.json`, `forms/`, `api-collections.json`, `webhooks.json`, `assets.json`, etc.

All of these are under the project directory. Every content save or delete triggers a commit (and optional push) when the project is a Git repository.

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
- **Push**: After each commit, the API may push to the remote. Push failures are non-fatal and do not block the request. You can disable auto-push via configuration if needed.

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

- **Snapshot workspace**: CLI `moteur workspace snapshot --project=... [--message="..."] [--push]` or programmatically `SnapshotService.snapshotWorkspace(projectId, message, user)`.
- **Snapshot user data**: Programmatically `SnapshotService.snapshotUserData(projectId, message, user)` (CLI can be added similarly).
- **Restore workspace**: CLI `moteur workspace restore --project=... [--from=moteur-workspace-snapshots]` or `SnapshotService.restoreWorkspace(projectId, fromBranch)`. Restore **merges** snapshot contents into the existing `.moteur/` directory; it does not delete files that exist only locally and are absent from the snapshot.
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

| Topic                       | Detail                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Content                     | Tracked on main (or current) branch; commit on every save; optional push.                 |
| `.moteur/` and `user-data/` | Gitignored; never committed to content branch.                                            |
| Snapshots                   | Orphan branches; workspace and user data are separate; `secrets.json` never in snapshots. |
| Restore                     | Merge snapshot into existing dir; does not delete extra local files.                      |
| Branches                    | List, create, switch, merge via API and CLI.                                              |
| Scheduler                   | In-process; per-project `enabled` and `cron` in `.moteur/snapshot-schedule.json`.         |

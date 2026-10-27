# Running and backing up Moteur

The engine stores authoritative content in files. Its default SQLite content index accelerates reads; it does not replace those files or make the authoring store safe for several independent writers.

## Host and persistent storage

Run the API on a compatible Node.js 22+ runtime, with Git available for revision and snapshot features. The default index needs `node:sqlite` (Node 22.13+); the engine logs a warning and uses file scans when that module is unavailable. A host installs the engine packages and explicitly composes optional plugins. For local development in this repository, install dependencies, build, and use `pnpm server:dev`.

Set `DATA_ROOT` explicitly to a persistent location in deployed environments. Relative storage settings resolve from it; an absolute `PROJECTS_DIR`, `AUTH_USERS_FILE` or other configured path can place data elsewhere and must be included in backups.

| Data                                | Default location relative to `DATA_ROOT`                | Backup consideration                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects and their Git repositories | `data/projects/`                                        | Include `.git` and all authoritative project files                                                                                                    |
| User accounts                       | `data/users.json`                                       | Includes authentication data; not restored by a content branch                                                                                        |
| Operators                           | `data/operators.json`                                   | Preserve separately from project membership                                                                                                           |
| Blueprints                          | `data/blueprints/`                                      | Include local customizations                                                                                                                          |
| Metering                            | `data/metering/`                                        | Includes persisted request/submission counts and credit ledger                                                                                        |
| Workspace and submissions           | Each project's `.moteur/` and `user-data/`              | Gitignored by the content branch                                                                                                                      |
| Project credentials                 | Each project's `.moteur/secrets.json`                   | Storage keys, video hosts' tokens, Shopify and Git tokens, forms' captcha secrets and token key; encrypted with `MOTEUR_ENCRYPTION_KEY`, never in Git |
| Media                               | Local asset storage and/or configured external adapters | Back up original binaries as well as metadata                                                                                                         |

Verify actual paths in the deployment; the host can override defaults. Keep required signing/encryption keys recoverable through the host's secret manager. Copying encrypted webhook secrets or `secrets.json` without their encryption key is not a complete restore.

A project's credentials (storage keys, video hosts' tokens, a Shopify token, the Git token, forms' captcha secrets) are kept in its `.moteur/secrets.json`, not in `project.json`, which every save commits and pushes. Saving a project moves any that are still in `project.json`, and the API does it for every project at start. Earlier commits still hold those values: rotate the keys of any project that had them.

Session files (`auth-sessions/`) and short-lived provider proofs (`provider-signins.json`) live beside the configured users file. Preserve the directory across restarts. After restoring older authentication state, revoke sessions or rotate signing keys before reopening traffic. See [Authentication](Authentication.md) for the upgrade requirement to sign in again.

## Configuration and health

Set the host's JWT secret, CORS origins and API base path. Use a separate operator secret for operator authentication; webhook secret encryption uses `MOTEUR_ENCRYPTION_KEY`. Provider credentials belong to the corresponding optional plugin. [Configuration](Configuration.md) owns the engine variable reference and [Authentication](Authentication.md) explains users, project keys and operators.

`GET /health` is a liveness check. The running host's `{API_BASE_PATH}/openapi.json` and `/docs` describe its actual composition. A healthy HTTP listener does not prove that email, remote media, Git pushes or scheduled work are succeeding; inspect their status and logs.

## Content index

`MOTEUR_CONTENT_INDEX=sqlite` is the default. Each project has a rebuildable `.moteur/cache/content-index.sqlite` with SQLite sidecar files. Files remain the source of truth. `MOTEUR_CONTENT_INDEX=files` scans files on each list query instead.

`MOTEUR_CONTENT_INDEX_RECHECK_MS` controls background reconciliation (default 30,000 ms; `0` disables it). API writes update the index directly. If external tooling changes files, allow reconciliation or restart the API to trigger freshness checks. Do not confuse this index with optional Algolia/Meilisearch plugins.

To force a clean index rebuild, stop the writer, move the project's content-index database and its SQLite sidecars out of the cache, and restart. Keep other workspace files. A rebuild cannot recover published content whose required Git snapshot is missing; restore that history or deliberately publish reviewed content again.

## Writer and scheduler model

Use one API writer for the file store. Atomic file replacement protects against partially written JSON, while entry services also serialize mutations in that process; neither mechanism provides cross-process transactions. Avoid simultaneous CLI/direct-file writes against the same live store. Adding replicas with independent volumes also produces independent content, users and schedules.

Publication schedules and snapshot timers run in process. Keep a writer running if they must execute on time. Interrupted publication jobs recover with at-least-once semantics. Outbound webhook retries persist deadlines and recover from the delivery outbox, with bounded local workers. They remain single-writer and at least once, rather than a distributed transactional queue. See [Scheduling](Scheduling.md) and [Webhooks](Webhooks.md).

## Backup and restore

Take a consistent filesystem backup with writes stopped or using a storage snapshot that captures the whole data set. Include overridden paths, local asset files and corresponding external stores. Git remotes preserve tracked content and history; they omit normal workspace state, submissions and account files unless separately backed up.

Restore into an isolated host first, using the matching engine/plugins and required secrets. Check sign-in, a published entry with newer draft edits, media retrieval, form submission access and schedule state before directing traffic to the restored instance. Rebuild the content index when necessary. [Git](Git.md) explains the narrower workspace and user-data snapshot features.

## Resource budgets

HTTP entry lists default to 100 rows and accept at most 1,000. Public reference expansion shares a request budget of 200 reference edges and 8 MiB of serialized entry work; repeated inlining is charged even when lookups are cached. An oversized query returns 422 `READ_BUDGET_EXCEEDED`: reduce its page size or expansion.

Uploads are admitted before memory buffering, with two concurrent uploads by default and retryable 429 backpressure. Image processing has two workers and at most eight waiting jobs; decoded input is limited to 16 million pixels, including animation frames. Existing HTTP body/file limits still apply. Body/header request timeouts bound incomplete HTTP uploads. Project routes also use the host's Studio rate limiter.

See [Configuration](Configuration.md) for configurable ceilings. These budgets protect processor and request work; persisted content, media and pending deliveries still need storage capacity monitoring.

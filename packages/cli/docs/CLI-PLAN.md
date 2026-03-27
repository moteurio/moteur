# Moteur CLI — Plan (aligned with codebase)

**Implemented:** Flat config only (`apiUrl`, `token`, `apiKey`, `projectId`). No remotes / multiple hosts. Project resolution: `getProjectId(args)` = `--project`/`--projectId` → `.moteur.json` projectId → config. `moteur doctor`, `moteur status`, activity/logs (project-scoped when projectId set, "Load more?" when TTY), standardised `formatError`, global flags (`--json`, `--quiet`, `--plain`, `--no-color`, `isTty`). Client: `projects.activity.list(projectId, { limit, before })`. **Doctor vs radar:** doctor = CLI/setup health; radar = project-level report.

This document uses the external “CLI Full Plan” prompt as a **guide only**. It is adjusted to our **actual** architecture, existing commands, and API so we can prioritize and implement incrementally.

---

## 1. Current state (as of this plan)

### 1.1 Config

- **Location:** `~/.moteur/config.json` (or `MOTEUR_CONFIG_DIR`). No per-project `.moteur.json` yet.
- **Shape:** Flat: `{ apiUrl?, token?, apiKey?, projectId? }`. Env overrides: `MOTEUR_API_URL`, `MOTEUR_TOKEN`, `MOTEUR_API_KEY`, `MOTEUR_PROJECT_ID`.
- **Single host only:** No remotes. One API URL + auth per config.

### 1.2 Client (`@moteurio/client`)

- **Config:** `baseURL`, optional `auth` (bearer token or apiKey + projectId). No `timeout`, no `projectId` at client level (we pass project in calls or use CLI config).
- **Resources:** auth, projects, models, entries, admin (forms, submissions, apiKey, etc.), blueprints, activity. **No** dedicated clients for: schedules, releases, environments, tokens, search (unless under admin/projects).
- **Activity:** REST only — `GET /activity` (global, admin) and project-scoped activity under projects. **No WebSocket/Socket.IO** in the client for live streaming.
- **Errors:** Thrown errors carry `message` and optionally `status` and `response`; we do **not** have a formal `MoteurClientError` with `code`, `hint`, `docs`.
- **Auto-start local engine:** Not implemented.

### 1.3 CLI commands (existing)

- **Auth:** login, logout, whoami, list (project users with `--project=id`), create-user, reset-password (both write local `users.json`; no API token). Login prompts for API URL (host), email, password (masked).
- **Projects / Models / Entries / Pages / Templates / Structures / Layouts / Navigations / Forms / Assets / Webhooks / Comments / Blueprints / Branches / Seed / Radar / Activity / Blocks / Fields / Userdata / Submissions / Workspace:** list, get, create, patch, delete (and command-specific ones). Entries: interactive list → select → view/edit (field-by-field or JSON). Activity: `activity list`, `logs`, `tail` — all use the **same** REST call (no live stream); `tail` does not “stay on”.
- **Global flags:** `--project`, `--json`, `--quiet`, `--plain`, `--no-color`, `isTty` are passed in args.
- **Rendering:** Chalk + cli-table3 for tables; Clack for all interactive prompts. No Ink in current codebase.

### 1.4 Activity & logs

- **API:** Global `GET /activity` (admin, limit, before). Per-project `GET /projects/:projectId/activity` (same shape).
- **Types:** `ActivityEvent`, `ActivityLogPage` in `@moteurio/types` (resourceType, action, userId, userName, timestamp, etc.).
- **Core:** `activityLogger.ts` writes to project JSON and triggers `activity.logged` on event bus. No built-in WebSocket push from the API for activity (presence/WebSocket exists for other features).

---

## 2. Architecture principles (keep from prompt)

- **CLI never imports `@moteur/core`.** All operations via `@moteurio/client` → REST API. ✅ Already the case.
- **Three rendering modes:** Simple (Chalk + cli-table3), Interactive (Clack), Live (Ink only where needed). Use one mode per command; no mixing.
- **TTY detection:** When stdout is not a TTY, prefer plain text; `--json` forces JSON; consider `--plain` to force plain text.
- **Single HTTP client:** `@moteurio/client` is the only client. ✅ Already.

---

## 3. Plan vs codebase — what to add or change

### 3.1 Config (single host)

- **No remotes.** Config is flat: `apiUrl`, `token`, `apiKey`, `projectId`. One host per config.
- **`.moteur.json`** in cwd can override `projectId` only (optional).
- **Project resolution:** `getProjectId(args)` = `--project` / `--projectId` → `.moteur.json` → config.projectId.

### 3.2 Global flags (prompt Part 3)

- Add and respect where missing: `--project`, `--json`, `--plain`, `--quiet`, `--debug`, `--no-color`.

### 3.3 Shell completions (prompt Part 4)

- **New:** `moteur completions zsh|bash|fish|install`.
- Completions for commands, subcommands, flags. Dynamic project/model IDs only from **cache** (e.g. 5 min) to avoid network during completion.

### 3.4 New or improved commands (prompt Part 5, mapped to our API)

| Command / area       | In prompt                                                  | We have                                              | Action                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **doctor**           | Ink/Listr2 checklist                                       | No                                                   | Add `moteur doctor`: config, reachable remote, auth, default project, optional schema/webhook/schedule checks. Simple or Listr2 first (no Ink required).            |
| **status**           | Chalk table snapshot                                       | No                                                   | Add `moteur status`: project summary (content counts, pending schedules, webhook failures, storage if API exists).                                                  |
| **tail**             | Ink, live WebSocket                                        | Same as logs (REST)                                  | **Option A:** Keep as one-shot until we have activity stream API. **Option B:** Add WebSocket activity stream in API + client, then implement live `tail` with Ink. |
| **logs**             | Paginated, filters, “Load more?”                           | list with limit/before                               | Add `--since`, `--event`, `--model`, `--user` if API supports; add “Load more?” when nextBefore exists.                                                             |
| **entries**          | list/get/create/update/publish/unpublish/delete/diff/watch | list/get/create/patch/delete + interactive view/edit | Add publish/unpublish if API has it; add `entries diff` and `entries watch` (watch = later, needs stream).                                                          |
| **models**           | list, get                                                  | ✅                                                   | Optional: get --json.                                                                                                                                               |
| **assets**           | list/upload/get/delete/regenerate-variants                 | We have list/get/delete/upload                       | Add progress bar for upload; add regenerate-variants if API exists.                                                                                                 |
| **webhooks**         | list/get/create/update/delete/rotate-secret/test/log/retry | We have list/get/create/update/delete                | Add test, log, retry, rotate-secret if API supports.                                                                                                                |
| **schedules**        | list/create/cancel/reschedule/upcoming/history             | Types exist; API to confirm                          | Add schedule commands when API is ready.                                                                                                                            |
| **releases**         | list/get/create/update/add/remove/cancel                   | Not in client/API yet                                | Defer until API exists.                                                                                                                                             |
| **environments**     | list/create/delete/rotate-key                              | Not in client/API yet                                | Defer.                                                                                                                                                              |
| **tokens**           | list/create/revoke/rotate                                  | Not in client; admin apiKey exists                   | Defer or align with admin apiKey.                                                                                                                                   |
| **search**           | reindex, query                                             | Not in client/API yet                                | Defer.                                                                                                                                                              |
| **forms**            | list, submissions, export                                  | We have forms + submissions                          | Add export (e.g. CSV) if API supports.                                                                                                                              |
| **diff** (cross-env) | staging vs production                                      | No                                                   | Defer until we have environments.                                                                                                                                   |
| **validate**         | Schema validation, --fix                                   | No                                                   | Add when we have validation API or local schema check.                                                                                                              |
| **snapshot**         | create/list/restore/delete                                 | No                                                   | Defer.                                                                                                                                                              |
| **export / import**  | Bulk export/import                                         | No                                                   | Defer; seed is partial.                                                                                                                                             |
| **studio / open**    | Start Studio, open deep links                              | No                                                   | Defer or add when Studio URL is defined.                                                                                                                            |
| **projects**         | list/create/get/delete                                     | ✅                                                   | Keep as is.                                                                                                                                                         |

### 3.5 Output standards (prompt Part 7)

- **Tables:** Consistent headers (bold), status badges (published/draft/scheduled/failed), truncate IDs, relative time in TTY / ISO in `--json`. We already use cli-table3 + chalk; standardise badges and truncation.
- **Errors:** Structured message + code + hint + docs link. Introduce `MoteurClientError` in client and use it in CLI.
- **Success:** One-line ✓ messages.
- **Destructive:** Confirmation or `--force`; we already have confirmDestructive.

### 3.6 CI (prompt Part 8)

- Non-TTY: no interactive prompts; fail with clear message if input missing.
- Exit codes: 0 success, 1 error, 2 validation (e.g. `validate`), 3 not found. Document and use consistently.
- `--quiet`: only errors. Already used in places; apply globally.

---

## 4. What we explicitly defer or skip (from prompt “Out of scope” + our context)

- **create-moteur-app:** Separate package; not part of this CLI plan.
- **GUI / Electron:** Out of scope.
- **CLI plugin system:** Out of scope.
- **moteur deploy:** Out of scope.
- **Auto-start local engine** in client: Nice-to-have; not required for first iterations.
- **Releases, environments, tokens, search, snapshot, export/import, studio/open, diff:** Defer until API and client support exist.
- **WebSocket tail:** Defer until we have an activity stream endpoint and client API (or document as “future: live tail”).

---

## 5. Suggested phases

### Phase 1 — Quick wins (current codebase)

- **Global flags:** Document and consistently support `--json`, `--quiet`, `--plain` (and TTY detection where useful).
- **logs:** Add `--since` if API supports it; add “Load more?” prompt when `nextBefore` present.
- **doctor:** New command: config exists, remote reachable, auth valid, default project; exit 1 if any fail (CI-friendly).
- **status:** New command: project summary (counts, pending, failures) using existing APIs.
- **Error format:** Standardise error display (message, code, hint) and align client errors with a small `MoteurClientError`-style shape where possible.

### Phase 2 — Completions and DX

- `moteur completions zsh|bash|fish|install` with cached project/model IDs.
- Document in CLI README / docs.

### Phase 3 — More commands and API alignment

- Schedules (when API is ready), webhooks test/log/retry, entries publish/unpublish/diff, validate, assets progress/regenerate.
- **tail (live):** Only after activity stream (WebSocket or SSE) exists in API and client.

---

## 6. References in codebase

- **Config:** `packages/cli/src/config.ts`
- **Client:** `packages/client/src/*.ts`, `packages/types/src/*.ts`
- **Activity API:** `packages/api/src/activity/index.ts`, `packages/api/src/projects/activity/index.ts`
- **Activity types and core logger:** `packages/types/src/Activity.ts`, `packages/core/src/activityLogger.ts`
- **Commands and registry:** `packages/cli/src/commands/*.ts`, `packages/cli/src/registry.ts`, `packages/cli/src/index.ts`

Use this plan to prioritise work. We do **not** use multiple remotes; single host only. WebSocket tail is deferred until the API supports it.

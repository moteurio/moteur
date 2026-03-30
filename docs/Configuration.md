# API configuration (environment variables)

This page lists environment variables used by the Moteur API. Details (rate limits, behaviour) are in [REST API](REST%20API.md).

---

## Base & CORS

| Variable                 | Description                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_BASE_PATH`          | Base path for all API routes (e.g. `/api`). Default: empty. Also prefixes interactive docs (`{basePath}/docs`), static asset URLs from the local adapter, and the canonical global blocks path (`/moteur/blocks`). |
| `CORS_ORIGINS`           | Comma-separated allowed origins. **Required for browser access:** if unset, no cross-origin origins are allowed (empty default). For local dev, set e.g. `http://localhost:3000,http://localhost:5173`.            |
| `STATIC_ASSETS_BASE_URL` | Origin for **local** asset URLs (scheme + host + port, **no** path). Default: `http://localhost:3000`. The API prepends `API_BASE_PATH` before `/static/assets/...` when generating URLs.                          |
| `API_UPLOAD_MAX_MB`      | Max multipart upload size for **studio** asset uploads (capped at 100). Default: `50` (aligned with per-project limits enforced in core).                                                                          |

---

## Request body

| Variable         | Description                                      |
| ---------------- | ------------------------------------------------ |
| `API_BODY_LIMIT` | Max JSON body size (e.g. `1mb`). Default: `1mb`. |

---

## Request logging & usage

| Variable               | Description                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `API_REQUEST_LOG_FILE` | Absolute path to the request audit log file (JSON lines). If set, classified **studio** and **public** requests are appended. |
| `API_REQUEST_LOG_DIR`  | Directory for the log file; file name is `api-requests.log`. Used only if `API_REQUEST_LOG_FILE` is not set.                  |

**Note:** API key and `Authorization` header are never written to the log. Use log rotation (e.g. logrotate) and retain logs as required for audit or billing.

---

## Rate limiting

| Variable                    | Description                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `API_RATE_LIMIT_STUDIO_MAX` | Max **studio**-classified requests per 15 min (per IP). Default: 10000 (effectively off). |
| `API_RATE_LIMIT_PUBLIC_MAX` | Max public requests per 15 min per project. Default: 1000.                                |
| `API_RATE_LIMIT_FORMS_MAX`  | Max form submissions per 15 min per form (keyed by projectId+formId). Default: 60.        |
| `API_RATE_LIMIT_LOGIN_MAX`  | Max login attempts per 15 min per IP. Default: 10.                                        |

---

## Security (Helmet)

| Variable              | Description                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `HELMET_DISABLED`     | Set to `1` to disable Helmet when `NODE_ENV` is not `production` (e.g. local API docs). Ignored in production. |
| `HELMET_CSP_DISABLED` | Set to `1` to disable only Content-Security-Policy.                                                            |

---

## Auth (JWT, OAuth)

- **JWT:** `JWT_SECRET` (required for login/refresh); `JWT_EXPIRY` (default `1h`).
- **Users file:** `AUTH_USERS_FILE` (default `data/users.json` relative to `DATA_ROOT`). See [REST API](REST%20API.md) for login and refresh.
- **OAuth:** `AUTH_GITHUB_*`, `AUTH_GOOGLE_*`, `AUTH_REDIRECT_AFTER_LOGIN` when using auth plugins. See [Plugins](Plugins.md).

---

## Presence (Studio)

| Variable                      | Description                                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ONLINE_PRESENCE_MAX_IDLE_MS` | For `GET /projects/:projectId/users`, a user counts as **`online`** if their Socket.IO presence `updatedAt` is at most this many milliseconds old. Integer; default **90000** (90s). Values below **1000** are ignored (fallback to default). Capped at **86400000** (24h). |

---

## AI

| Variable                     | Description                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `MOTEUR_AI_PROVIDER`         | Provider: `openai`, `anthropic`, or `mock`. **Required** for AI; when unset, AI is disabled (503, Studio hides AI).                       |
| `MOTEUR_AI_CREDIT_COSTS`     | Optional. JSON object to override default credit costs per operation (see [AI](AI.md)).                                                   |
| `MOTEUR_AI_CREDITS_DISABLED` | Set to `1` (or `true`) to disable AI credit checks and deductions (unlimited credits). Temporary until persistent credits/billing exists. |
| `OPENAI_API_KEY`             | OpenAI key; used when provider is `openai`.                                                                                               |
| `ANTHROPIC_API_KEY`          | Anthropic key; used when provider is `anthropic`.                                                                                         |

See [AI](AI.md) for full documentation.

---

## Plugins

| Variable                 | Description                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `MOTEUR_HOST_PLUGINS`    | Comma-separated module specifiers (npm package names or local file paths) for host-composed plugins.                  |
| `MOTEUR_ENABLED_PLUGINS` | Optional comma-separated plugin IDs allowlist. If set, only listed plugin IDs from `MOTEUR_HOST_PLUGINS` are enabled. |

---

## Storage & data

Project and content are stored locally (git-native). See the main [README](../README.md) for data layout.

| Variable         | Description                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATA_ROOT`      | Root directory for Moteur data (default: repo root when running from API package). `PROJECTS_DIR`, `AUTH_USERS_FILE`, and `BLUEPRINTS_DIR` are resolved relative to this when given as relative paths. |
| `PROJECTS_DIR`   | Projects directory (default `data/projects` relative to `DATA_ROOT`). Each project is a directory with `project.json`, content files, and optionally `.moteur/` and `user-data/` (gitignored).         |
| `BLUEPRINTS_DIR` | Blueprints directory (default `data/blueprints` relative to `DATA_ROOT`).                                                                                                                              |

- **Git**: Content is committed on every save when the project is a Git repo; `.moteur/` and `user-data/` are never committed on the main branch. See [Git integration](Git.md) for snapshots, branches, and the snapshot scheduler.
- **Snapshot scheduler**: Runs in-process; per-project schedule is stored in `.moteur/snapshot-schedule.json` (`enabled`, `cron`). No environment variables are required for the scheduler.

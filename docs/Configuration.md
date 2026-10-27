# API configuration (environment variables)

This page lists environment variables used by the Moteur API. Details (rate limits, behaviour) are in [REST API](REST%20API.md).

---

## Base & CORS

| Variable                 | Description                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_BASE_PATH`          | Base path for all API routes (e.g. `/api`). Default: empty. Also prefixes interactive docs (`{basePath}/docs`), static asset URLs from the local adapter, and the canonical global blocks path (`/moteur/blocks`). |
| `CORS_ORIGINS`           | Comma-separated allowed origins. **Required for browser access:** if unset, no cross-origin origins are allowed (empty default). For local dev, set e.g. `http://localhost:3000,http://localhost:5181`.            |
| `STATIC_ASSETS_BASE_URL` | Origin for **local** asset URLs (scheme + host + port, **no** path). Default: `http://localhost:3000`. The API prepends `API_BASE_PATH` before `/static/assets/...` when generating URLs.                          |
| `API_UPLOAD_MAX_MB`      | Max multipart upload size for **studio** asset uploads. Default: `50` (aligned with per-project limits enforced in core). Each upload is held in memory while it's processed, so size the server's RAM to match.   |
| `MOTEUR_MCP`             | `off` leaves out `/mcp`, the MCP server for remote AI clients (on by default). Its tools call the API itself at `http://127.0.0.1:{PORT}{API_BASE_PATH}`.                                                          |

---

## Request body

| Variable         | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| `API_BODY_LIMIT` | Max JSON body size (e.g. `1mb`), incoming webhooks included. Default: `1mb`. |

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
- **OAuth:** `AUTH_GITHUB_*`, `AUTH_GOOGLE_*`, `AUTH_REDIRECT_AFTER_LOGIN` when using auth plugins. See the [host plugin guide](https://github.com/moteurio/moteur-plugins/blob/main/docs/Plugins.md).
- **New accounts and email codes** (see [Authentication](Authentication.md#new-accounts-and-email-codes)): `MOTEUR_SIGNUP=open` lets anyone make an account; otherwise only invited people can (also through a provider). `MOTEUR_EMAIL_SIGNIN=off` turns email codes off. `MOTEUR_EMAIL_CODES_PER_HOUR` caps code emails for the whole server (default `300`). `MOTEUR_EMAIL_CODES_TO_LOG=1` prints codes to the log instead of mailing them, for a developer's machine only. `DEMO_PROJECT_ID` names the project copied for people who ask to be shown around (none without it; that id is reserved). `STUDIO_URL` puts Studio links in the welcome email.
- **Operators** (they run the server and are not users; see [Authentication](Authentication.md#operators)): `OPERATORS_FILE` (default `data/operators.json` relative to `DATA_ROOT`); `OPERATOR_SECRET` (recommended: the key for operator tokens and authenticator secrets, so a leaked `JWT_SECRET` reaches no operator; derived from `JWT_SECRET` when unset; changing it ends every operator session, and they then sign in with a recovery code or are reset); `STUDIO_URL` (for the full one-time links `moteur-operators` prints).

---

## Membership status and metering

These variables are read by the engine even when no AI or presence plugin is installed. They do not enable those plugins or add their routes.

| Variable                      | Description                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ONLINE_PRESENCE_MAX_IDLE_MS` | Freshness window for the online flag on project-member reads; default 90,000 ms. A presence plugin must supply heartbeats before anyone appears online. |
| `MOTEUR_METERING_DIR`         | Persistent request/submission counts and credit ledger; default `data/metering` under `DATA_ROOT`.                                                      |
| `MOTEUR_AI_MONTHLY_CREDITS`   | Default engine credit allowance per project and UTC calendar month; default `1000`, or `unlimited`. Host plugins can override allowances.               |
| `MOTEUR_AI_CREDITS_DISABLED`  | `1` or `true` disables engine credit checks and deductions. It does not enable generation.                                                              |

Provider keys, AI generation costs and Socket.IO transport settings belong to the optional plugins. Their manuals live in `moteur-plugins-extra`; the engine does not bundle those services.

---

## OpenAPI (export / CI)

| Variable                           | Description                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `MOTEUR_FAIL_ON_OPENAPI_COLLISION` | Set to `1` to abort API bootstrap when merged OpenAPI paths collide (core vs plugins). |

Export and response checks do not require the server; see [REST API — OpenAPI](REST%20API.md#-openapi) and [`packages/api/README.md`](../packages/api/README.md).

---

## Plugins

| Variable                 | Description                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MOTEUR_HOST_PLUGINS`    | Comma-separated module specifiers (npm package names or local file paths) for host-composed plugins.                                                                                                                                                                                                                     |
| `MOTEUR_ENABLED_PLUGINS` | Optional comma-separated plugin ID allowlist. When **set** (including empty), only listed ids from loaded host plugins run. When **unset**, every successfully loaded module from `MOTEUR_HOST_PLUGINS` is enabled. Operators can override that list (saved in `data/operator/plugins.json`; applies at the next start). |

---

## Storage & data

Project and content are stored locally (git-native). See the main [README](../README.md) for data layout.

| Variable         | Description                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATA_ROOT`      | Root directory for Moteur data. Set it explicitly on deployed hosts; fallback resolution depends on the working directory. `PROJECTS_DIR`, `AUTH_USERS_FILE`, `OPERATORS_FILE` and `BLUEPRINTS_DIR` are resolved relative to this when given as relative paths. |
| `PROJECTS_DIR`   | Projects directory (default `data/projects` relative to `DATA_ROOT`). Each project is a directory with `project.json`, content files, and optionally `.moteur/` and `user-data/` (gitignored).                                                                  |
| `BLUEPRINTS_DIR` | Blueprints directory (default `data/blueprints` relative to `DATA_ROOT`).                                                                                                                                                                                       |

- **Git**: Content is committed on every save when the project is a Git repo; `.moteur/` and `user-data/` are never committed on the main branch. See [Git integration](Git.md) for snapshots, branches, and the snapshot scheduler.
- **Snapshot scheduler**: Runs in-process; per-project schedule is stored in `.moteur/snapshot-schedule.json` (`enabled`, `cron`). No environment variables are required for the scheduler.

## Content index

| Variable                          | Description                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MOTEUR_CONTENT_INDEX`            | `sqlite` (default) for a rebuildable per-project index, or `files` for direct scans. SQLite requires `node:sqlite`; unavailable/unknown adapters fall back to scans with a warning. |
| `MOTEUR_CONTENT_INDEX_RECHECK_MS` | SQLite reconciliation interval for external file edits: default `30000`; `0` disables background reconciliation. API writes update the index directly.                              |

See [Operations](Operations.md) for storage, backup/restore, the single-writer model and scheduler requirements, and [MCP](MCP.md) for hosted transport configuration.

## Webhook secret storage

`MOTEUR_ENCRYPTION_KEY` encrypts stored webhook secrets and projects' Git tokens with AES-256-GCM. In production, the engine refuses Git tokens while it is unset. Preserve the key when restoring a data backup. See [Webhooks](Webhooks.md) for delivery limits and signature verification.

## Verification and resource budgets

| Variable                          | Default    | Purpose                                                                        |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `SMTP_HOST`, `SMTP_FROM`          | Unset      | Required to deliver signup verification codes; no silent verification fallback |
| `SMTP_PORT`                       | `587`      | SMTP port; `465` uses TLS at connection                                        |
| `SMTP_USER`, `SMTP_PASS`          | Unset      | Optional SMTP authentication                                                   |
| `API_RATE_LIMIT_VERIFICATION_MAX` | `60`       | Provider verification requests per IP per 15 minutes; maximum 1,000            |
| `API_UPLOAD_CONCURRENCY`          | `2`        | Concurrent buffered uploads; maximum 8; excess receives 429                    |
| `MOTEUR_IMAGE_CONCURRENCY`        | `2`        | Image workers; maximum 8; eight additional jobs may wait                       |
| `MOTEUR_IMAGE_MAX_PIXELS`         | `16000000` | Input pixel ceiling, including animation frames; maximum 100 million           |
| `API_READ_MAX_REFERENCES`         | `200`      | Reference edges per delivery request; maximum 2,000                            |
| `API_READ_MAX_BYTES`              | `8388608`  | Serialized entry-work budget per delivery request; maximum 64 MiB              |

Session and verification state follows `AUTH_USERS_FILE` into its parent directory. The session-aware release requires users to sign in again. Release the engine/API, auth providers, presence plugin and Studio together; provider callbacks use the updated SDK contract. See [Authentication](Authentication.md) and [Operations](Operations.md).

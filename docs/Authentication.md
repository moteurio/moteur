# Authentication

This page summarizes how to authenticate with the Moteur API: **JWT** for Studio and authenticated API use, **project API key** for read-only access (e.g. frontends and static site generators). For endpoint details, see [REST API](REST%20API.md). For environment variables, see [Configuration](Configuration.md).

---

## JWT (Studio and API)

Use JWT when you need to create or update content, manage projects, or use Moteur Studio. The token is a Bearer token sent in the `Authorization` header.

### Getting a JWT

**Email/password login:**

```http
POST {basePath}/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "..." }
```

Response: `{ "token": "<jwt>", "user": { ... } }`. Use `token` in subsequent requests:

```http
Authorization: Bearer <token>
```

**Refresh:** Before the token expires, call `POST {basePath}/auth/refresh` with the same (or a valid) JWT. Returns `{ "token": "<new-jwt>" }`.

**Current user:** `GET {basePath}/auth/me` (with JWT) returns `{ "user": { ... } }` including the user’s projects.

### OAuth (GitHub, Google)

If enabled, use the browser flow:

- `GET {basePath}/auth/github` or `GET {basePath}/auth/google` — redirects to the provider.
- Provider redirects back to `.../auth/github/callback` or `.../auth/google/callback`.
- The API sets a session or returns a token; `AUTH_REDIRECT_AFTER_LOGIN` (or default `/auth/callback`) is used as the final redirect.

List available providers with `GET {basePath}/auth/providers` (returns `{ "providers": [...] }`).

### Environment variables (JWT and OAuth)

| Variable                    | Description                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `JWT_SECRET`                | **Required.** Secret used to sign and verify JWTs. Use a long random value in production. |
| `AUTH_USERS_FILE`           | Path to the users file (default: `data/users.json`). See storage config.                  |
| `AUTH_REDIRECT_AFTER_LOGIN` | Where to redirect after OAuth login (default: `/auth/callback`).                          |
| `AUTH_GITHUB_CLIENT_ID`     | GitHub OAuth app client ID (enables GitHub login when set with secret and redirect URI).  |
| `AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app secret.                                                                  |
| `AUTH_GITHUB_REDIRECT_URI`  | GitHub OAuth redirect URI (e.g. `http://localhost:3000/auth/github/callback`).            |
| `AUTH_GOOGLE_CLIENT_ID`     | Google OAuth client ID.                                                                   |
| `AUTH_GOOGLE_CLIENT_SECRET` | Google OAuth secret.                                                                      |
| `AUTH_GOOGLE_REDIRECT_URI`  | Google OAuth redirect URI.                                                                |

---

## Project API key (read-only)

Each project has at most one **API key**. Use it to read data via the **Public API** — collections, page outputs (sitemap, navigation, urls, breadcrumb), and radar. Key auth is **read-only**: GET requests only; POST/PATCH/DELETE with only the API key return 403.

**Browsers:** prefer a backend or edge that holds the key. If the key is used from client-side JavaScript, do so only when the key (or your API gateway) is **restricted to specific allowed domains or origins**, so it cannot be reused effectively from arbitrary third-party sites.

### How to send the key

- **Header:** `x-api-key: <your-project-api-key>`
- **Query:** Not supported. Use the header only.

If both JWT and API key are present, JWT takes precedence for authorization.

### Getting the key

The key is created and rotated with **JWT** and **project access**. The raw key is returned **only once** when you generate or rotate it; store it securely (e.g. env var, secrets manager). These routes live under **`/projects/:projectId/...`**. See [REST API](REST%20API.md).

- **Generate:** `POST {basePath}/projects/:projectId/api-key/generate` — returns `{ "rawKey": "...", "prefix": "mk_live_...", "message": "..." }`.
- **Rotate:** `POST {basePath}/projects/:projectId/api-key/rotate` — replaces the key, returns the new raw key once.
- **Revoke:** `DELETE {basePath}/projects/:projectId/api-key` — removes the key (response **204**).
- **Status:** `GET {basePath}/projects/:projectId/api-key` — returns prefix only (e.g. `mk_live_...`), not the raw key.

See [Public API and Collections](Public%20API%20and%20Collections.md) for using the key with collections.

### JavaScript SDK (`@moteurio/client`)

| Factory                        | Auth                                                                        | Use case                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`createMoteurAdminClient`**  | Bearer JWT (optional `apiKey` for mixed tooling, but not the primary story) | Full API: projects, **`/models/.../entries`**, project-scoped resources (pages, templates, **navigations** documents, assets, …), per-project **`/projects/:id/activity`**, **`client.instance`** (deployment maintenance on the server), blueprints; optional global **`GET /activity`** (cross-project, operator-oriented). |
| **`createMoteurPublicClient`** | **`x-api-key`** + required **`projectId`**                                  | Read-only: collection list/get, **`channel(collectionId)`** (entries/pages/forms/layouts as exposed by the collection), **`site`** (sitemap, navigation tree, urls, breadcrumb), radar GET.                                                                                                                                   |

Details and examples: [packages/client/README.md](../packages/client/README.md).

---

## Auth model summary

| Auth method             | Applies to                                                                                                                                                                      | Middleware                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **JWT** (Bearer token)  | All routes by default (Studio, project CRUD, global studio routes)                                                                                                              | `requireAuth`, `requireProjectAccess`, `requireOperator`           |
| **API Key** (read-only) | Collections, page outputs, radar                                                                                                                                                | `optionalAuth` + `apiKeyAuth` + `requireCollectionOrProjectAccess` |
| **None** (intentional)  | `POST /auth/login`, `GET /auth/providers`, form submissions (`POST .../forms/:formId/submit`), inbound webhooks (`POST /webhooks/mux`, `/webhooks/vimeo`), static asset serving | Rate limiting or signature verification                            |

### Platform operator role

Users who can list all projects, manage global blueprints, and call `/studio/*` routes carry the **operator** role. The exact string stored in JWT and in `users.json` `roles` is **`OPERATOR_ROLE_SLUG`** from `@moteurio/types` (kept stable for existing deployments; today this value is `admin`).

Operators may also **PATCH** another user who belongs to the same project via `PATCH /projects/:projectId/users/:userId` (Studio **Users & Permissions**). That updates the global `users.json` record (name, email, `isActive`, `roles`, `avatar`), not only the project link.

### Sign-in timestamps

On each successful **password** or **OAuth** sign-in, the server sets `lastLoginAt` on the user (ISO 8601) in `users.json`. Token **refresh** does not update `lastLoginAt`. The field is exposed on `GET /auth/me` and on `GET /projects/:projectId/users` for project members.

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

{ "username": "user@example.com", "password": "..." }
```

The JSON field is **`username`** (use the account email or username stored in `users.json`).

Response: `{ "token": "<jwt>", "user": { ... } }`. Use `token` in subsequent requests:

```http
Authorization: Bearer <token>
```

**Refresh:** Before the token expires, call `POST {basePath}/auth/refresh` with the same (or a valid) JWT. Returns `{ "token": "<new-jwt>" }`.

**Current user:** `GET {basePath}/auth/me` (with JWT) returns `{ "user": { ... } }` including the user’s projects.

### OAuth provider plugins

OAuth routes are contributed by host plugins (GitHub, Google, Microsoft or generic OIDC), rather than bundled with the engine. For GitHub/Google, the browser flow is:

- `GET {basePath}/auth/github?next=/projects` (or `/auth/google`) — sets a short-lived `moteur_oauth` cookie and redirects to the provider with a signed `state` and a PKCE challenge (S256). The verifier is derived from the cookie, so a code from one browser's sign-in can't be redeemed in another's. Plugins use `oauthChallenge(state)` and the `verifier` that `completeOAuth` returns. `next` is optional and must be a relative path.
- The provider redirects back to `.../auth/github/callback` (or `.../auth/google/callback`). The API checks `state` against the cookie (10 minutes, same browser), then matches the stored provider identity. A new identity needs a verified email and creates an account stored as a Writer (its roles in each project are set there); matching an existing account's email alone does not link it.
- The API then redirects to the configured `AUTH_REDIRECT_AFTER_LOGIN` with the result in the URL fragment, so it never reaches server logs: `#token=<jwt>&next=/projects`, or `#error=state|email|inactive|failed` (bad or expired state, no verified email, account turned off, anything else).

The Studio handles this at `/auth/callback`: point `AUTH_REDIRECT_AFTER_LOGIN` at it (e.g. `https://studio.moteur.io/auth/callback`). The `AUTH_*_REDIRECT_URI` values must reach the API **through the same origin the sign-in started on**, or the browser won't send the cookie back. In local development the Studio proxies the API, so use `http://localhost:5181/moteur-api/auth/github/callback` and `AUTH_REDIRECT_AFTER_LOGIN=http://localhost:5181/auth/callback`.

List available providers with `GET {basePath}/auth/providers` (returns `{ "providers": [{ "id": "github", "label": "GitHub" }] }`). The Studio shows a "Continue with…" button for each, and nothing about OAuth when the list is empty.

A provider is listed only when it is turned on and set up correctly; otherwise its routes answer 404. It is left out when:

- it is turned off with `AUTH_<PROVIDER>_ENABLED=false` (also `0`, `off`, `no`), or none of its settings are set;
- one of its three settings is missing, or the client ID or secret contains spaces;
- its redirect URI isn't an absolute URL ending in `/auth/<provider>/callback`, or uses plain http outside localhost;
- `JWT_SECRET` isn't set, or `AUTH_REDIRECT_AFTER_LOGIN` isn't set or isn't a URL or path.

In those cases (except when turned off or not set up at all), the server logs once why, e.g. `[auth] github sign-in is hidden: AUTH_GITHUB_CLIENT_SECRET not set.`

Generic OIDC uses authenticated UserInfo with a stable subject and discovery metadata matching the configured issuer. An explicitly verified provider email can onboard a new account directly. An unverified claim, username or UPN is only a suggestion: the person must verify an email through Moteur before a new account is created. Already linked provider identities can sign in without a new email claim.

### Verify an address or connect an existing account

After OAuth, a browser-bound pending sign-in can return to Studio's `/auth/connect` page. To create an account when the provider omitted email verification, enter an address, request a six-digit code, then verify it. The pending sign-in expires after 10 minutes; wrong-code attempts are limited to five, and resends have a cooldown and persistent budgets. Restarting the API does not reset those budgets. Email proof alone never connects a provider to an existing account.

To connect an existing account, sign in using its existing method and explicitly confirm the new connection. Studio's **Account security** screen starts this flow with `link=1`, preserved in signed OAuth state. Connecting or disconnecting requires a personal sign-in from the last 10 minutes; refresh and delegated tokens cannot manufacture fresh authentication. Removing the last sign-in method is refused. Credential changes revoke existing sessions and return a replacement token without resetting the original authentication time or session deadline.

Verification uses `SMTP_HOST`, `SMTP_FROM` and optional `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, shared with the engine's other mail. Without SMTP, code delivery fails instead of treating an address as verified. Verification requests need both the opaque ticket from the callback and its HttpOnly browser cookie; requests from a separate Studio origin use credentials and the configured CORS allowlist. Prefer a same-site API/Studio deployment or the development proxy so browsers can send the binding cookie.

| Method | Route below `/auth`      | Purpose                                                               |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| POST   | `/provider/pending`      | Describe a pending browser-bound sign-in                              |
| POST   | `/provider/email`        | Send a verification code; body: `ticket`, `email`                     |
| POST   | `/provider/verify`       | Verify and create a new account; body: `ticket`, `code`               |
| POST   | `/provider/link`         | Confirm a provider connection; body: `ticket`, plus recent member JWT |
| GET    | `/connections`           | List the account's connected provider IDs                             |
| DELETE | `/connections/:provider` | Disconnect after recent personal sign-in                              |

Provider installation belongs to the [host plugin guide](https://github.com/moteurio/moteur-plugins/blob/main/docs/Plugins.md). See [MCP](MCP.md) for hosted MCP's separate OAuth connection flow and JWT fallback.

### Sessions and revocation

JWTs contain a persisted session ID. Access-token expiry still uses `JWT_EXPIRY`; the default personal session has an absolute 24-hour lifetime. Refresh preserves its original authentication time and deadline. Delegated/agent tokens cannot refresh or outlive their parent session; revoking a parent invalidates its children. The private presence plugin also disconnects affected live sockets when sessions end.

Studio's **Account security** page lists sessions and can end one or all. Signing out revokes the current session when the API is reachable, then clears the local token. Password, account email, activation and account-role changes revoke sessions. Account state is stored with private file permissions beside the users file, including per-user `auth-sessions/` files and short-lived `provider-signins.json` proofs; persist that directory across restarts. This remains a single-writer file store, not a distributed session database.

The session-aware release rejects old stateless JWTs: users and CLI clients must sign in again after upgrading. Browser clients continue to use Bearer tokens; this change does not introduce an HttpOnly session/BFF transport.

| Method | Route below `/auth`    | Purpose                                                    |
| ------ | ---------------------- | ---------------------------------------------------------- |
| GET    | `/sessions`            | List active personal and delegated sessions                |
| DELETE | `/sessions/:sessionId` | Revoke one session and its descendants                     |
| DELETE | `/sessions`            | Revoke all of the account's sessions                       |
| POST   | `/logout`              | Revoke the current session                                 |
| POST   | `/refresh`             | Renew access within the original personal-session deadline |

### Two-step sign-in

Anyone can turn on a second step after the password (or after GitHub, Google, Microsoft or OIDC): a code from an authenticator app. In the Studio, Account security › Two-step sign-in shows a QR code, turns on with a first code, and shows ten recovery codes once.

Signing in then answers `{ twoFactor: true, ticket }` instead of a token (`POST /auth/login`, `POST /auth/provider/verify`; a provider's redirect brings `#two_factor=…`). `POST /auth/two-factor/verify` with `{ ticket, code }` gives the session: the ticket lasts five minutes and is no session itself; a code from the app works once; a recovery code works once and is then gone. Wrong codes slow the next attempts down like wrong passwords.

| Method | Route below `/auth`          | Purpose                                                    |
| ------ | ---------------------------- | ---------------------------------------------------------- |
| POST   | `/two-factor/verify`         | Ticket and code: the session                               |
| GET    | `/two-factor`                | Whether it's on, and recovery codes left                   |
| POST   | `/two-factor/setup`          | A secret, its `otpauth` link and a QR code (SVG)           |
| POST   | `/two-factor/enable`         | Turn on with a first code: `{ recoveryCodes }`, shown once |
| POST   | `/two-factor/disable`        | Turn off, with a code or a recovery code                   |
| POST   | `/two-factor/recovery-codes` | New recovery codes, with a code                            |

Only the person does this, in a personal session: never an agent. The secret is sealed with `MOTEUR_ENCRYPTION_KEY` (refused in production without it) and the recovery codes are kept as digests; neither ever leaves the server, and sign-in replies carry no password hash. Someone who lost both phone and codes asks an operator: `POST /operator/users/:userId/two-factor/reset` (CLI: `moteur operator reset-two-factor <id>`) turns it off and ends their sessions. The CLI's `moteur auth login` asks for the code.

### Invites

Project admins invite people by email: `POST {basePath}/projects/:projectId/invites` with `{ "email", "roles", "appUrl" }`. The link (`<studio>/invite/<token>`) is valid for 7 days, is emailed when SMTP is set up (`SMTP_HOST`, `SMTP_FROM`), and is returned once in the response so it can be shared by hand. Only a hash of the token is stored (`invites.json`, next to the users file). Inviting the same address again, or `POST …/invites/:inviteId/resend`, makes a new link and the old one stops working; `DELETE …/invites/:inviteId` withdraws it.

The link points at the Studio in `appUrl` when its origin is listed in `CORS_ORIGINS` or `STUDIO_URL`, otherwise at `STUDIO_URL`; with neither, nothing is emailed and the Studio shows the link to copy.

On the link, `GET {basePath}/invites/:token` describes the invite. Someone signed in **with the invited address** joins with `POST /invites/:token/accept`; someone with no account creates one with `POST /invites/:token/register` (`{ "name", "password" }`), since the link proves the address. Signing in with GitHub or Google using that address works too. An invite can't be accepted from another address.

**People per plan.** Moteur doesn't limit how many people a project has. A host plugin can, with `ctx.setPeopleLimit(projectId => max | null)` in its `init` (api.moteur.io's billing plugin does, by plan). Members and pending invites both take a seat. Inviting, accepting, registering from an invite, or adding users in a project update all answer **402** `{ code: "plan_limit", limit: "people", max }` when that would go over. A project already over its limit (after a downgrade) keeps its people; it just can't add more. `GET /projects/:projectId/usage` reports `people: { members, invited, max }`. The other plan limits (files, monthly API requests, projects per person) are in [REST API › Plan limits](REST%20API.md#plan-limits).

### Environment variables (JWT and OAuth)

| Variable                    | Description                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                | **Required.** Secret used to sign and verify JWTs. Use a long random value in production.            |
| `AUTH_USERS_FILE`           | Path to the users file (default: `data/users.json`). See storage config.                             |
| `AUTH_REDIRECT_AFTER_LOGIN` | **Required for OAuth.** Where to send people after OAuth login (e.g. the Studio's `/auth/callback`). |
| `AUTH_GITHUB_ENABLED`       | `false` turns GitHub login off while keeping its settings.                                           |
| `AUTH_GOOGLE_ENABLED`       | `false` turns Google login off while keeping its settings.                                           |
| `AUTH_GITHUB_CLIENT_ID`     | GitHub OAuth app client ID (enables GitHub login when set with secret and redirect URI).             |
| `AUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app secret.                                                                             |
| `AUTH_GITHUB_REDIRECT_URI`  | GitHub OAuth redirect URI (e.g. `http://localhost:3000/auth/github/callback`).                       |
| `AUTH_GOOGLE_CLIENT_ID`     | Google OAuth client ID.                                                                              |
| `AUTH_GOOGLE_CLIENT_SECRET` | Google OAuth secret.                                                                                 |
| `AUTH_GOOGLE_REDIRECT_URI`  | Google OAuth redirect URI.                                                                           |

---

## New accounts and email codes

Anyone can sign in, or make an account, with an email and a six-digit code: no password to keep. `POST /auth/email/code` sends the code, `POST /auth/email/verify` trades it for a session. A known address gets a code to sign in. A new one gets a code to make an account when the server takes new accounts (`MOTEUR_SIGNUP=open`) or the address has a live invite. The answer is `{ sent: true }` either way, and the email goes out after it, so neither the answer nor its timing tells who has an account.

- A code works once, for 15 minutes, five tries. One code a minute and ten an hour per address. After ten wrong codes in a day, codes for that address are off until the next day.
- With `STUDIO_URL` set, each email also carries a sign-in link to Studio's `/auth/email` page, with a long token after `#` (so it reaches no server log). Studio sends it as `token` in place of `code`. The link works once, for 15 minutes, and keeps working when wrong codes have turned codes off: someone typing wrong codes for another person's address can't keep them out. Asking again for the address doesn't void a link already sent. Without `STUDIO_URL`, an address with codes off gets nothing that day. The whole server sends at most `MOTEUR_EMAIL_CODES_PER_HOUR` (default 300).
- Codes are stored as a keyed hash, never as they are.
- Two-step sign-in still applies: a code gives a ticket for the app's code, like a password does.
- Accounts made by code have no password: password sign-in refuses them. Email addresses are compared without case.
- The CLI signs in with a code too: `moteur auth login` sends one when the password is left empty (or with `--email-code`), and takes the code or the email's link pasted in its place. It asks `GET /auth/signup` first, and only offers a code when the server can send one. On an open server, a code for a new address makes the account there, as in Studio.
- `MOTEUR_EMAIL_SIGNIN=off` turns email codes off, for servers where owning a mailbox must not be enough.

A server is closed by default: without `MOTEUR_SIGNUP=open`, only invited people can make an account, by code, invite link or provider. Moteur Cloud is open.

A new account records how it was made and the site page that brought them (`signup`), and what they came for (`onboarding`: `PATCH /auth/me/onboarding`). The Studio's welcome screens ask once. `POST /auth/me/demo` copies the server's demo project (`DEMO_PROJECT_ID`) for them, at most three times: its content only, never its workspace (`.moteur/`), credentials, outbound webhooks, Git history or form submissions. Whoever creates a project is its admin, billing and developer.

## Project API keys (read-only)

Each project may have **several API keys**. Any one of them can authenticate reads via the **Public API** — channels and page outputs (sitemap, navigation, urls, breadcrumb) — subject to that key’s **restrictions** (`allowedHosts`, optional **channel allowlist**, optional **site-wide** access). Key auth is **read-only**: GET requests only; POST/PATCH/DELETE with only an API key return 403.

**Browsers:** prefer a backend or edge that holds the key. If the key is used from client-side JavaScript, configure **allowed hosts** on the key (see below) and align **`CORS_ORIGINS`** on the API server with the same origins.

### How to send the key

- **Header:** `x-api-key: <your-secret>`
- **Query:** Not supported. Use the header only.

If both JWT and API key are present, JWT takes precedence for authorization.

### Allowed hosts (optional)

You can bind each key to one or more **hostname patterns** stored as `allowedHosts`:

- **`undefined` or `[]`:** No host check (default). Keys work from browsers, curl, and server-side clients as today.
- **Non-empty list:** After the key hash is validated, the request must include **`Origin`** or **`Referer`** parseable as a URL whose **hostname** matches at least one pattern. Otherwise the API returns **403** with `code: "API_KEY_HOST_NOT_ALLOWED"`. Patterns are **exact hosts** (e.g. `www.example.com`) or a **single** leading wildcard segment (`*.my-project.vercel.com` matches `foo.my-project.vercel.com` but not `a.b.my-project.vercel.com`). **Rotation preserves** restriction fields.

**Channel allowlist (optional):** If a key defines `allowedChannelIds`, it may only read those channels. `GET .../channels` returns only allowed items. Keys with a non-empty allowlist **cannot** use sitemap, navigation, urls or breadcrumb unless **`allowSiteWideReads`** is true for that key.

Configure with JWT:

- **List:** `GET {basePath}/projects/:projectId/api-keys` — array of metadata per key (never raw secrets).
- **Update:** `PATCH {basePath}/projects/:projectId/api-keys/:keyId` — body may include `allowedHosts`, `label`, `allowedChannelIds` (`null` clears channel restriction), `allowSiteWideReads`.

**Limitations:** `Origin`/`Referer` can be set by any HTTP client; this mitigates casual abuse and wrong-site embedding but does not replace keeping the key secret. For server-to-server reads with a restricted key, use **JWT** instead or leave `allowedHosts` empty.

### Getting the key

The key is created and rotated with **JWT** and **project access**. The raw key is returned **only once** when you generate or rotate it; store it securely (e.g. env var, secrets manager). These routes live under **`/projects/:projectId/...`**. See [REST API](REST%20API.md).

- **Create:** `POST {basePath}/projects/:projectId/api-keys` — optional body `{ label?, expiresAt?, allowedChannelIds?, allowSiteWideReads? }`. Returns metadata plus `rawKey` once.
- **Rotate:** `POST {basePath}/projects/:projectId/api-keys/:keyId/rotate` — new secret; preserves restrictions. A key with an expiry keeps the same lifetime, counted from the rotation.
- **Revoke:** `DELETE {basePath}/projects/:projectId/api-keys/:keyId` — removes that key (**204**).

**Expiry:** keys never expire unless `expiresAt` (a future ISO date-time) is set on create or `PATCH`; `null` removes it. After that time, requests with the key get **401** `{ "error": "API key expired", "code": "API_KEY_EXPIRED" }`. Listing keys returns `expiresAt` and `expired`.

See [Public API and Channels](Public%20API%20and%20Channels.md) for using the key with channels.

### JavaScript SDK (`@moteurio/client`)

| Factory                        | Auth                                                                        | Use case                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`createMoteurAdminClient`**  | Bearer JWT (optional `apiKey` for mixed tooling, but not the primary story) | Full API: projects, **`/models/.../entries`**, project-scoped resources (pages, templates, **navigations** documents, assets, …), per-project **`/projects/:id/activity`**, **`client.instance`** (deployment maintenance on the server), blueprints; optional global **`GET /activity`** (cross-project, operator-oriented). |
| **`createMoteurPublicClient`** | **`x-api-key`** + required **`projectId`**                                  | Read-only: channel list/get, **`channel(channelId)`** (entries/pages/forms/layouts as exposed by the channel), **`site`** (sitemap, navigation tree, urls, breadcrumb).                                                                                                                                                       |

Details and examples: [packages/client/README.md](../packages/client/README.md).

---

## Auth model summary

| Auth method             | Applies to                                                                                                                                                                      | Middleware                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **JWT** (Bearer token)  | All routes by default (Studio, project CRUD, global studio routes)                                                                                                              | `requireAuth`, `requireProjectAccess`, `requireProjectAdmin`, `requireOperator` |
| **API Key** (read-only) | Channels, page outputs                                                                                                                                                          | `optionalAuth` + `apiKeyAuth` + `requireChannelOrProjectAccess`                 |
| **None** (intentional)  | `POST /auth/login`, `GET /auth/providers`, form submissions (`POST .../forms/:formId/submit`), inbound webhooks (`POST /webhooks/mux`, `/webhooks/vimeo`), static asset serving | Rate limiting or signature verification                                         |

### Roles in a project

Each user has **account roles** (`roles` in `users.json`). A project may set other roles for a member in `memberRoles` (user id to roles); in that project those replace the account roles. `requireProjectAccess` resolves them, so after it `req.user.roles` are the member's roles in that project (`req.account` keeps the stored account).

- Whoever creates a project (`POST /projects`, or the demo copy made at sign-up) becomes **Admin**, **Developer** and **Billing** on it, on top of their Studio roles.
- Project admins (`requireProjectAdmin`) update or delete the project, invite people and set their roles, and import or export it.
- Builders (`requireBuilder`, Developer implies it) change how the project is built: create, update or delete its models, block types, structures, page templates, layouts and forms, and restore their earlier versions. Writers fill these in. They can't change them.
- Content leads (`requireContentLead`, Admin implies it) change media settings, move videos, delete files, entries and pages for good from the bins, delete others' notes, and publish without review.
- Content leads and builders change menus. Writers can't, since a menu is live as saved.
- Developers (`requireDeveloper`) manage channels, API keys, webhooks, branches and the project's Git remote (its token, and pushing now).
- Writers (and the roles that imply Writer) read and handle form submissions and make preview links (translators make preview links too). Translators and Billing do neither: submissions hold what visitors wrote about themselves.
- Agents working for review (the default) draft and propose. They can't delete entries, pages or form submissions, take published content offline (now or by schedule), or change or delete an existing menu: a person does that. They can create a new menu.
- `PATCH /projects/:projectId/users/:userId` with `roles` sets that member's roles in this project only. It needs Admin in the project, and the project must keep at least one admin. Only someone with **Developer** gives or takes Developer, and only someone with **Billing** gives or takes Billing, on members and in invitations alike. Admin implies neither. Unknown role names are dropped. `memberRoles` cannot be written through `PATCH /projects/:projectId`.
- Ids that become file paths (entries, pages, schedules, forms, submissions and the rest) are letters, digits, `_` and `-` only; anything else answers **400**.
- Uploaded files are stored under the extension of the type they were accepted as, and served with `nosniff`. Anything but images, video, audio, PDFs and 3D models is sent as a sandboxed download, never shown as a page on the API's origin.
- `GET /projects` lists the projects the signed-in user belongs to. `GET /blueprints/*` is open to anyone signed in, so they can pick a starting point; changing blueprints is for operators (below).
- A project's member list changes through invitations and the members routes, never `PATCH /projects/:projectId`. A member's account itself (name, email, active) is changed by them, or by an operator: `PATCH /projects/:projectId/users/:userId` only sets their roles in that project.
- A project's Git remote is an `https://` address, for everyone: a local path, `file://` or SSH could reach another project's repository on the host.

## Operators

**Operators run the whole server**: every project and account, plugins, plans and revenue, server-wide blueprints, blocks and structures, seeding and usage. They are **not users**. No role on an account or in a project, `admin` and `developer` included, reaches beyond the projects someone belongs to; an account's roles only set its default roles in projects.

- **Where they live:** `OPERATORS_FILE` (default `data/operators.json` under `DATA_ROOT`), never `users.json`. The file is written readable by the server's own user only (`0600`). Passwords are bcrypt hashes; authenticator secrets are encrypted (AES-256-GCM); recovery codes are stored as hashes.
- **Signing in:** `POST /operator/auth/login` with `email`, `password` and `code`, the 6-digit code from an authenticator app (TOTP, RFC 6238: 1Password, Google Authenticator, Authy…) or one of their ten one-time recovery codes. A code works once. Every mistake answers the same `401`; five in a row lock the email for 15 minutes (`429`), on top of a rate limit per address.
- **Their token:** one hour, no refresh; then they sign in again with a new code. It is signed with a key of its own (from `OPERATOR_SECRET`, else derived from `JWT_SECRET`), so a user token never passes as an operator's, nor the other way round. Each request checks the operator still exists and their sign-in hasn't been reset, so removing or resetting an operator ends their sessions at once.
- **Operator routes** (`requireOperator`: `/operator/*`, `/billing/operator/*`, `POST /moteur/blocks`, blueprint changes, `/studio/seed`, `/studio/usage`, `GET /activity`, plugin routes marked so) accept only an operator token. The request then acts as the engine, named after the operator ("Louise (operator)") in what it records.

### Adding operators

The first operator starts on the server, where the API's data is (nobody can create one over HTTP):

```bash
moteur-operators add you@example.com --name "Your Name"   # ships with @moteurio/api
```

It prints a **one-time link** (24 hours; `STUDIO_URL` makes it a full address): `<studio>/operator/enroll/<token>`. There they add Moteur to their authenticator app (QR code, or the key typed in), confirm with a code, choose a password (12 characters or more) and keep their recovery codes. After that, operators add, reset (lost phone: sessions end, new link) and remove each other in the Studio (**Operator › Operators**), with `moteur operator add-operator`, or with `moteur-operators` on the server (`list`, `add`, `reset`, `remove`). The last operator who can sign in can't be removed.

### In the Studio and the CLI

The Studio's operator area has its own sign-in at **`/operator`** (email, password, code), apart from the projects': its session lives in that browser tab only and ends after the hour. People's menus don't link to it.

On the command line, `moteur operator login` asks for the email, password and code and keeps the hour-long session in `~/.moteur/operator.json` (only you can read it; `MOTEUR_OPERATOR_TOKEN` works too). Every command that calls an operator route uses that session, never `moteur auth login`. The MCP server never offers operator commands, whatever its options.

### Sign-in timestamps

On each successful **password** or **OAuth** sign-in, the server sets `lastLoginAt` on the user (ISO 8601) in `users.json`. Token **refresh** does not update `lastLoginAt`. The field is exposed on `GET /auth/me` and on `GET /projects/:projectId/users` for project members.

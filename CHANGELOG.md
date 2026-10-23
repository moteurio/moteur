# Changelog

All notable changes to published `@moteurio/*` packages are documented here. Version lines are kept aligned across the monorepo for coordinated releases (see [RELEASING.md](RELEASING.md) and [VERSIONING.md](VERSIONING.md)).

## 2026.3.28.2

- fix buid (8de9db2)
- Fix stage releases using pnpm pack (3f06898)

## 2026.10.23

- Fix release orchestrator (434383e)
- Fix releasing (2e32b6d)
- chore(api): align version with lockstep release line 2026.3.29 (9982728)
- ci: fix release orchestrator and stop publishing @moteurio/ai (d496b85)
- feat(api,core): drop @moteurio/ai from the engine (cce173b)
- fix(api): /mcp documents only responses with a body (87e5c82)
- Fix lint (abe6fe7)
- feat(mcp,api): Moteur for AI agents (19a24fc)
- feat(cli,commands): every API operation as a command; the Atelier leaves (c1b8f0c)
- feat(core,api): agents act for people (87a85fd)
- feat(core,api): bring back a version of an entry, page or layout (ca3249a)
- feat(core,api,client): the media library (b2042d2)
- feat(ai): audio and 3D models from a description (b83405c)
- docs: the hosted API reference; the Studio is private (894c7c3)
- feat(plugins): plugin architecture and the Studio plugin SDK (342bfc9)
- refactor: presence leaves the engine (ad38a7d)
- chore: ignore local demo data; a shared CI setup action (a370272)
- Engine updates (#48) (1ccfd1e)
- Plan limits (#46) (16a51de)
- Invites and sign-in (#45) (102f790)
- feat(api): project admins run their projects, developers hold the keys (5baa65b)
- feat(types,core): six roles, set per project (26450a6)
- fix(core): a form's settings are checked when saved (536d295)
- fix(api): the AI audit list returns at most 200 events (857ef10)
- fix(api): webhooks and uploads follow their size settings (8e4dd50)
- fix(core,api,cli): one password rule, 8 to 200 characters (86c9bce)
- fix(client): asset uploads are sent as multipart (8169f8b)
- fix(api): resolveAssets and resolveUrl accept true and yes (3b2c164)
- fix(core): an object's optional sub-fields may be left empty (5c56517)
- fix(core): a git command that exits early no longer crashes with EPIPE (636bf1b)
- feat(core,types): list fields name the summary of a collapsed item (1412505)
- feat(types): per-model list settings in studio.list (4b6c13c)
- feat(core): drafts may leave required fields empty (9049e86)
- feat(core): list entries with search, filters, sort, grouping and facets (eaceb93)
- fix(core): git commands no longer fail on large output (dcaa43f)
- Fix main (3f2e493)
- fix(core): name entries by slug in commit messages only when it is a string (cf6e2a5)
- feat(demo): generator for demo projects (72aef65)
- feat(api): list field types and the options each takes (2bf1d69)
- fix(api): validate a model PATCH as the model will be after the update (9beb557)
- feat(types,core): one Studio form per model, checked as warnings (575b7c9)
- feat(core,api): read an entry as it was saved in a revision (95c11d4)
- fix(core): name entries by slug in commit messages only when it is a string (4fc8814)
- feat(core,api,client): SQLite content index for entry listing (c75033a)
- fix(api): serve media cross-origin and from data roots under dot-directories (8c55596)
- fix(core): an object field may have its own "value" sub-field (ab4dfd5)
- fix(core): optional sub-fields of a structure may be absent (40b0d57)
- fix(core): load core structures from the data root and accept namespaced ids (ec5f431)
- fix(core): schedules more than 24.8 days out no longer fire at once (35385c4)
- fix(core): name entries by slug in commit messages only when it is a string (dd35a30)
- fix(core): skip pushing when the content repo has no remote (02cc373)
- fix(core): append activity events one at a time so none is lost (ccec811)
- feat(api,client): schedules API, client and tests (418e1da)
- fix(core): concurrent atomic JSON writes use their own temp file (65e869d)
- fix(core): publishing records the revision being saved (8d51770)
- fix(core): approving a review publishes the entry; commit review changes (c6ae57b)
- fix(core,api): partial entry updates keep fields they leave out (1964159)
- chore: migrate husky hooks to v9 format (f0b69f9)
- chore(deps): upgrade dependencies and fix pnpm 11 config (f97b704)
- fix(core): normalize bracketed IPv6 hostnames for webhook SSRF checks (37d8d4e)
- fix(core): block SSRF on outbound webhooks via DNS and IP checks (7827e3e)
- fix(api): require explicit CORS_ORIGINS; remove localhost default (66c9392)
- feat: gate HTML iframe/embed tags per project (default off) (c03778d)
- fix(api): register unhandledRejection and uncaughtException handlers (c6c8d3c)
- Bump eslint from 9.29.0 to 10.1.0 (0abaaf6)
- ci: No hardcoded version check. (306798c)
- fix(core): guard text field pattern against invalid and ReDoS-prone regex (SEC-3) (fb060bb)
- fix(api): prevent path traversal in git log endpoint (SEC-2) (6e4b0eb)

## 2026.3.29

- _(no commits in range)_

## 2026.3.28

First coordinated `moteur@` release tag; recent commits (no prior `moteur@*` tag):

- ci: authenticate release orchestrator with RELEASE_PAT (d6fba33)
- ci: one-stop release orchestrator (GitHub release + auto CHANGELOG) (1f46a71)
- feat(api): add GET /health for load balancers and probes (070ba53)
- ci: set release line from UTC date in release orchestrator (02cff2a)
- fix(api): use node:timers/promises for login delay sleep (df19ec1)
- feat(api): progressive per-email login delay after failures (c0802e4)
- fix(api): log errors in async video webhook handlers (f5d6861)
- fix(api): ignore HELMET_DISABLED when NODE_ENV is production (bbb54f2)
- fix(api): cap login password length at 128 for bcrypt DoS mitigation (c47acf7)
- chore: remove fly.toml from public repo, ignore locally (d811f78)
- chore: bump @typescript-eslint packages to ^8.57.2 (b035d44)
- chore: stop CRLF vs Prettier drift on Windows (f28777c)
- feat: adopt calendar release line for @moteurio packages (5f00e5f)
- feat(api): multiple project API keys with per-key restrictions (9c2359b)
- feat(api-key): restrict x-api-key to allowed host patterns (edc9b18)
- Bump eslint-plugin-prettier from 5.5.1 to 5.5.5 (e526fbf)
- Bump @vitest/coverage-v8 from 3.2.4 to 4.1.2 (fd8c75f)
- Bump @typescript-eslint/eslint-plugin from 8.34.1 to 8.35.1 (3b6db11)
- fix(api): commit Express Request type augmentation for CI (618610d)
- fix(core): add @types/nodemailer for TS7016 on CI (f2070f5)
- fix(core): add nodemailer dependency for emailNotifier (bb064d5)
- Fix lint on CI. (d06b9e0)
- Initial Moteur commit. (8485058)

## 2026.3.27

Adopt **calendar release line** versioning for npm (`package.json`): `YYYY.M.D` with optional same-day prerelease index (`YYYY.M.D-N`). Canonical four-part display form `YYYY.MM.DD.micro` is documented in [VERSIONING.md](VERSIONING.md). This replaces the previous `0.1.0` SemVer-era line for coordinated publishes.

## 0.1.0

Pre-calendar line (SemVer **0.x**) for:

- `@moteurio/types`, `@moteurio/plugin-sdk`, `@moteurio/core`, `@moteurio/ai`, `@moteurio/presence`, `@moteurio/api`, `@moteurio/client`, `@moteurio/cli`

**Semver (0.x):** Until this line was retired, minor bumps could include breaking HTTP or npm API changes; patch bumps were fixes. The active scheme is described in [VERSIONING.md](VERSIONING.md).

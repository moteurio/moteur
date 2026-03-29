# Changelog

All notable changes to published `@moteurio/*` packages are documented here. Version lines are kept aligned across the monorepo for coordinated releases (see [RELEASING.md](RELEASING.md) and [VERSIONING.md](VERSIONING.md)).

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

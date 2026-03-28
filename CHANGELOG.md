# Changelog

All notable changes to published `@moteurio/*` packages are documented here. Version lines are kept aligned across the monorepo for coordinated releases (see [RELEASING.md](RELEASING.md) and [VERSIONING.md](VERSIONING.md)).

## 2026.3.27

Adopt **calendar release line** versioning for npm (`package.json`): `YYYY.M.D` with optional same-day prerelease index (`YYYY.M.D-N`). Canonical four-part display form `YYYY.MM.DD.micro` is documented in [VERSIONING.md](VERSIONING.md). This replaces the previous `0.1.0` SemVer-era line for coordinated publishes.

## 0.1.0

Pre-calendar line (SemVer **0.x**) for:

- `@moteurio/types`, `@moteurio/plugin-sdk`, `@moteurio/core`, `@moteurio/ai`, `@moteurio/presence`, `@moteurio/api`, `@moteurio/client`, `@moteurio/cli`

**Semver (0.x):** Until this line was retired, minor bumps could include breaking HTTP or npm API changes; patch bumps were fixes. The active scheme is described in [VERSIONING.md](VERSIONING.md).

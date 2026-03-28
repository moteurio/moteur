# Releasing (moteur)

Version scheme: calendar release line for published packages ([VERSIONING.md](VERSIONING.md)).

## Required secrets

- `NPM_TOKEN` with publish permissions for `@moteurio/*`.

## Primary release path

Use the orchestrator workflow:

- `.github/workflows/release-orchestrator.yml`
- Trigger via `workflow_dispatch`.
- Optional input `release_client_cli=false` to NOT publish `@moteurio/client` and `@moteurio/cli` (defaults to true)

Publish order is deterministic:

1. `@moteurio/types`
2. `@moteurio/plugin-sdk`
3. `@moteurio/core`
4. `@moteurio/ai`
5. `@moteurio/presence`
6. `@moteurio/api`
7. optional: `@moteurio/client`, `@moteurio/cli`

The workflow stops on first failure.

## Secondary path (fallback)

Per-package tag workflows still exist (for manual/emergency publishes):

- `types@*`, `plugin-sdk@*`, `core@*`, `ai@*`, `presence@*`, `api@*`, `client@*`, `cli@*`

Do not run fallback tag workflows in parallel with the orchestrator.

## Preflight checks

- `node scripts/validate-release-versions.mjs`
- Ensure package versions/dependency ranges are aligned to the expected release line (including `@moteurio/client`: published packages must use `^<line>` when not `workspace:*`, same as other `@moteurio/*` internals). Override the default line with `EXPECTED_MOTEUR_LINE` if needed (see [VERSIONING.md](VERSIONING.md)).
- Dry-run each tarball before publishing: from the package directory after `pnpm --filter <pkg> run build`, run `npm publish --dry-run` and confirm `files`, `exports`, and no accidental `src/` leakage.
- Optional: [npm provenance](https://docs.npmjs.com/generating-provenance-statements) (`npm publish --provenance`) when publishing from GitHub Actions with OIDC.

## Release notes

- Summarize user-facing changes in GitHub Releases and/or [CHANGELOG.md](CHANGELOG.md).

## Rollback policy

If a publish fails mid-run:

1. Stop and fix the failing package.
2. Bump versions for any already-published packages if needed.
3. Re-run orchestrator from a clean commit.
4. Never overwrite an existing npm version.

## After a successful publish

- **Host (`api.moteur.io` or equivalent):** bump `@moteurio/`\* ranges if needed, run `pnpm install` so the lockfile resolves from the registry (not `link:`), then deploy. See that repo’s README.
- **Plugins (`moteur-plugins`):** run the plugin release orchestrator with `expected_moteur_line` set to the published `@moteurio/`\* line you support (same calendar line as in [VERSIONING.md](VERSIONING.md)).

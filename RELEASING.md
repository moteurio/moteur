# Releasing (moteur)

Version scheme: calendar release line for published packages ([VERSIONING.md](VERSIONING.md)).

## Required secrets

- `NPM_TOKEN` with publish permissions for `@moteurio/*`.

The orchestrator uses the default `GITHUB_TOKEN` with `contents: write` to push commits, push tags, and create GitHub Releases. If the branch you release from is [protected](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), ensure the workflow can push (for example a bypass actor for `github-actions[bot]`, or a PAT with `contents` scope stored as a repository secret and used for checkout/push).

## Primary release path

Use the orchestrator workflow:

- `.github/workflows/release-orchestrator.yml`
- Trigger via `workflow_dispatch`.
- Optional input `release_client_cli=false` to NOT publish `@moteurio/client` and `@moteurio/cli` (defaults to true)

In one run the workflow:

1. Sets the calendar release line on all published `packages/*/package.json` (see [scripts/set-release-version-from-date.mjs](scripts/set-release-version-from-date.mjs)).
2. Prepends a `## <line>` section to [CHANGELOG.md](CHANGELOG.md) with `git log` entries since the latest `moteur@*` tag (by tag date), or a capped bootstrap list when no `moteur@*` tag exists yet (see [scripts/prepend-release-changelog.mjs](scripts/prepend-release-changelog.mjs)).
3. Commits those changes and pushes to the branch you ran the workflow from.
4. Creates and pushes tag `moteur@<line>` (same string as the npm release line).
5. Publishes packages to npm in the order below.
6. Creates a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) for `moteur@<line>` using the same notes as the new changelog section.

Re-running for an unchanged release line fails: [CHANGELOG.md](CHANGELOG.md) already contains that `##` section.

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

- The orchestrator fills both [CHANGELOG.md](CHANGELOG.md) and the GitHub Release body from commit subjects since the previous `moteur@*` tag. You can still edit [CHANGELOG.md](CHANGELOG.md) after the fact to add narrative or group changes for readers.

## Rollback policy

If a publish fails mid-run:

1. Stop and fix the failing package.
2. The branch may already contain `chore(release): <line>` and tag `moteur@<line>` may already exist on the remote even if npm did not finish; adjust or delete the tag only if you know no consumers rely on it, then use a same-day suffix (e.g. `2026.3.28-2`) per [VERSIONING.md](VERSIONING.md) if you need a new npm version.
3. Bump versions for any already-published packages if needed.
4. Re-run orchestrator from a clean commit (or the pushed release commit, if appropriate).
5. Never overwrite an existing npm version.

## After a successful publish

- **Host (`api.moteur.io` or equivalent):** bump `@moteurio/`\* ranges if needed, run `pnpm install` so the lockfile resolves from the registry (not `link:`), then deploy. See that repo’s README.
- **Plugins (`moteur-plugins`):** run the plugin release orchestrator with `expected_moteur_line` set to the published `@moteurio/`\* line you support (same calendar line as in [VERSIONING.md](VERSIONING.md)).

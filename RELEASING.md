# Releasing (moteur)

Version scheme: calendar release line for published packages ([VERSIONING.md](VERSIONING.md)).

## Required secrets

- `NPM_TOKEN` with publish permissions for `@moteurio/*`.
- `RELEASE_PAT` — personal access token used to push the release commit and tags to [protected](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) branches and to create GitHub Releases. The workflow job keeps `GITHUB_TOKEN` read-only; all git writes and `gh release` use this secret.

### Creating `RELEASE_PAT` on GitHub

1. Use a **dedicated** GitHub user (machine account) or your own account. The account must be allowed to **push to the branch** you release from (e.g. member with bypass on `main`, or admin).
2. Create a token:
    - **Fine-grained:** Repository access: this repo only. **Contents:** Read and write. **Metadata:** Read. (If `gh release create` fails with 403, add whatever “Releases” permission your UI offers for that repo.)
    - **Classic:** Scope **`repo`** (full control of private repositories) for a private repo, or at minimum enough to push and manage releases on this repository.
3. In the **moteur** repo: **Settings → Secrets and variables → Actions → New repository secret** → name **`RELEASE_PAT`**, value = the token → **Add secret**.

The orchestrator fails fast if `RELEASE_PAT` is missing. After `actions/checkout` with this token, `git push` uses the same credentials for branch and tag pushes; **`gh release create`** uses `GH_TOKEN=$RELEASE_PAT`.

## Primary release path

Use the orchestrator workflow:

- `.github/workflows/release-orchestrator.yml`
- Trigger via `workflow_dispatch`.
- Optional input `release_client_cli=false` to NOT publish `@moteurio/client` and `@moteurio/cli` (defaults to true)

In one run the workflow:

1. Sets the release line on all published `packages/*/package.json` (see [scripts/set-release-version-from-date.mjs](scripts/set-release-version-from-date.mjs)): UTC calendar `YYYY.M.D`, then if **`@moteurio/types@<that>`** already exists on the npm registry, uses **`YYYY.M.D-2`**, **`-3`**, … until a free line is found (same-day republish without using the workflow override). Optional workflow input **`release_version_override`** forces an exact version and skips this probe. Local runs can set **`SKIP_NPM_VERSION_PROBE=1`** to use only the calendar base (no network).
2. Prepends a `## <line>` section to [CHANGELOG.md](CHANGELOG.md) with `git log` entries since the latest `moteur@*` tag (by tag date), or a capped bootstrap list when no `moteur@*` tag exists yet (see [scripts/prepend-release-changelog.mjs](scripts/prepend-release-changelog.mjs)).
3. Commits those changes and pushes to the branch you ran the workflow from.
4. Creates and pushes tag `moteur@<line>` (same string as the npm release line).
5. Publishes packages to npm in the order below.
6. Creates a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) for `moteur@<line>` using the same notes as the new changelog section.

Re-running with the **same** resolved line fails if [CHANGELOG.md](CHANGELOG.md) already has that `##` section. After a successful publish the same day, the next run usually auto-picks **`YYYY.M.D-2`** (etc.), so the changelog guard does not block.

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
2. The branch may already contain `chore(release): <line>` and tag `moteur@<line>` may already exist on the remote even if npm did not finish; adjust or delete the tag only if you know no consumers rely on it. The next orchestrator run normally picks the next free same-day line via the npm probe; use **`release_version_override`** if you need a specific version.
3. Bump versions for any already-published packages if needed.
4. Re-run orchestrator from a clean commit (or the pushed release commit, if appropriate).
5. Never overwrite an existing npm version.

## After a successful publish

- **Host (`api.moteur.io` or equivalent):** bump `@moteurio/`\* ranges if needed, run `pnpm install` so the lockfile resolves from the registry (not `link:`), then deploy. See that repo’s README.
- **Plugins (`moteur-plugins`):** run the plugin release orchestrator with `expected_moteur_line` set to the published `@moteurio/`\* line you support (same calendar line as in [VERSIONING.md](VERSIONING.md)).

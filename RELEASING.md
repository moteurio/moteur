# Releasing (moteur)

Version scheme: calendar release line for published packages ([VERSIONING.md](VERSIONING.md)).

## Required secrets

- `RELEASE_PAT` — personal access token used to **push** the release commit and tags to [protected](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) branches and to create GitHub Releases. Checkout uses the job’s read-only `GITHUB_TOKEN` (same as CI); only `git push`, tag push, and `gh release` use this secret.
- `NPM_STAGING_TOKEN` — **granular access token** used only in CI to run [`npm stage publish`](https://docs.npmjs.com/staged-publishing/). Create it at [npm → Access Tokens](https://www.npmjs.com/settings/~tokens):
    - **Packages and scopes:** `@moteurio/*` (or each published package).
    - **Permissions:** **Read and write (stage only)** — not “publish and stage”.
    - **Bypass 2FA:** may be enabled for staging in automation (staging does not require 2FA; **approval** always does).
    - Direct `npm publish` with bypass-2FA tokens is deprecated (removed **January 2027**); this repo does not use it.

### After the orchestrator runs (maintainer)

CI stages every package version; nothing is live on the registry until you **approve** with 2FA:

1. [npm → Staged packages](https://www.npmjs.com/settings/~/packages/staged), or
2. Locally: `npm stage list`, then `npm stage approve <stage-id>` (npm CLI **≥ 11.15**, Node **≥ 22.14**).

Approve in **publish order** (types → … → api → optional cli) so dependents exist when downstream consumers resolve the new line.

Emergency **direct** publish from a laptop (not CI): `npm publish` with your normal npm login session and 2FA — do not put that credential in GitHub.

### Creating `RELEASE_PAT` on GitHub

1. Use a **dedicated** GitHub user (machine account) or your own account. The account must be allowed to **push to the branch** you release from (e.g. member with bypass on `main`, or admin).
2. Create a token:
    - **Fine-grained:** Repository access: this repo only. **Contents:** Read and write. **Metadata:** Read. (If `gh release create` fails with 403, add whatever “Releases” permission your UI offers for that repo.)
    - **Classic:** Scope **`repo`** (full control of private repositories) for a private repo, or at minimum enough to push and manage releases on this repository.
3. In the **moteur** repo: **Settings → Secrets and variables → Actions → New repository secret** → name **`RELEASE_PAT`**, value = the token → **Add secret**.

The orchestrator verifies `RELEASE_PAT` with `git ls-remote` before checkout (`persist-credentials: false`). Pushes use an explicit PAT URL with the credential helper disabled so GitHub never authenticates as `github-actions[bot]`. **`gh release create`** uses `GH_TOKEN=$RELEASE_PAT`. If push still fails with 403, the PAT account needs permission to push to protected `main`.

## Primary release path

Use the orchestrator workflow:

- `.github/workflows/release-orchestrator.yml`
- Trigger via `workflow_dispatch`.
- Optional input `release_client_cli=false` to NOT publish `@moteurio/cli` (defaults to true)

In one run the workflow:

1. Sets the calendar release line on all published `packages/*/package.json` (see [scripts/set-release-version-from-date.mjs](scripts/set-release-version-from-date.mjs)).
2. Prepends a `## <line>` section to [CHANGELOG.md](CHANGELOG.md) with `git log` entries since the latest `moteur@*` tag (by tag date), or a capped bootstrap list when no `moteur@*` tag exists yet (see [scripts/prepend-release-changelog.mjs](scripts/prepend-release-changelog.mjs)).
3. Commits those changes and pushes to the branch you ran the workflow from.
4. Creates and pushes tag `moteur@<line>` (same string as the npm release line).
5. **Stages** packages on npm (`npm stage publish`) in the order below — versions are not public until approved (see above).
6. Creates a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) for `moteur@<line>` using the same notes as the new changelog section.

Re-running for an unchanged release line fails: [CHANGELOG.md](CHANGELOG.md) already contains that `##` section.

Publish order is deterministic:

1. `@moteurio/types`
2. `@moteurio/plugin-sdk`
3. `@moteurio/studio-plugin-sdk`
4. `@moteurio/core`
5. `@moteurio/client`
6. `@moteurio/commands`
7. `@moteurio/mcp` (the API serves it at `/mcp`)
8. `@moteurio/api`
9. optional: `@moteurio/cli`

**`@moteurio/plugin-ai`** (and **`ai-provider-*`**) live in **moteur-plugins-extra** (private tarballs). Studio UI companions (`@moteurio/studio-plugin-*` except the SDK) ship on the same GitHub Releases, not on npm.

The workflow stops on first failure.

## Secondary path (fallback)

Per-package tag workflows still exist (for manual/emergency publishes):

- `types@*`, `plugin-sdk@*`, `core@*`, `api@*`, `client@*`, `cli@*`

Do not run fallback tag workflows in parallel with the orchestrator.

## Preflight checks

- `node scripts/validate-release-versions.mjs`
- Ensure package versions/dependency ranges are aligned to the expected release line (including `@moteurio/client`: published packages must use `^<line>` when not `workspace:*`, same as other `@moteurio/*` internals). Override the default line with `EXPECTED_MOTEUR_LINE` if needed (see [VERSIONING.md](VERSIONING.md)).
- Staging uses `node scripts/stage-publish.mjs @moteurio/<pkg>` (`pnpm pack` then `npm stage publish` on the tarball). Do **not** run `npm stage publish` from `packages/<pkg>` — that uploads `workspace:*` and breaks `npm install` on hosts.
- Same-day republish override must be semver prerelease: **`2026.3.28-2`**, not `2026.3.28.2`. The orchestrator normalizes the dotted form when possible; prerelease stages pass **`--tag latest`** to npm.
- Dry-run: after `pnpm pack`, inspect the tarball’s `package/package.json` dependencies before staging.

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

# Contributing to @moteurio/cli

This package lives in the main Moteur repo at **packages/cli/**.

## Prerequisites

- Node.js 18+
- pnpm (or npm / yarn)

## Setup

1. Clone the repo and go to the CLI package:

    ```bash
    git clone https://github.com/moteurio/moteur.git
    cd moteur
    pnpm install
    cd packages/cli
    ```

2. Build and test:

    ```bash
    pnpm run build
    pnpm test
    pnpm run lint
    ```

## Proposing changes

1. Create a branch, make changes, add/update tests, run build/test/lint.
2. Open a pull request against [moteurio/moteur](https://github.com/moteurio/moteur).

## Releasing

Releases are published to npm as **@moteurio/cli** (bin: `moteur`).

### Automated (GitHub Actions)

Push a tag to trigger publish:

```bash
# After bumping packages/cli/package.json version (e.g. to 0.1.1)
git tag cli@0.1.1
git push origin cli@0.1.1
```

The workflow `.github/workflows/release-cli.yml` runs tests, builds, and publishes when the tag matches `cli@*`. Requires `NPM_TOKEN` in repo secrets.

### Manual

From repo root:

```bash
pnpm --filter @moteurio/cli run build
pnpm --filter @moteurio/cli exec -- npm publish --access public
```

Or from `packages/cli`:

```bash
cd packages/cli
pnpm run build
npm publish --access public
```

Bump the version in `package.json` before publishing.

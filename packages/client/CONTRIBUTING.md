# Contributing to @moteurio/client

Thanks for your interest in contributing. This package lives in the main Moteur repo at **packages/client/**.

## Prerequisites

- **Node.js** 18+ (or 20+ recommended)
- **pnpm** (or npm / yarn)

## Setup

1. **Clone the repository**

    ```bash
    git clone https://github.com/moteurio/moteur.git
    cd moteur/packages/client
    ```

2. **Install dependencies** (from repo root or from packages/client)

    From repo root:

    ```bash
    cd moteur && pnpm install
    ```

    From packages/client (if the monorepo is already installed):

    ```bash
    pnpm install
    ```

3. **Build**

    ```bash
    pnpm run build
    ```

4. **Run tests**

    ```bash
    pnpm test
    ```

5. **Lint**

    ```bash
    pnpm run lint
    ```

## Proposing changes

1. Create a branch from `main` (or the default branch).
2. Make your changes. Keep the code style consistent with the existing codebase (TypeScript, ESM, existing naming).
3. Add or update tests if you change behavior.
4. Run `pnpm run build`, `pnpm test`, and `pnpm run lint` before submitting.
5. Open a **pull request** against [moteurio/moteur](https://github.com/moteurio/moteur) with a clear description of the change and reference any related issues.

## Code style

- TypeScript strict mode; use the existing patterns (e.g. `encodeURIComponent` for path segments, `Record<string, unknown>` for API entities).
- New API methods should mirror the REST API and include JSDoc if the return shape is non-obvious.

## Releasing

Releases are published to npm as **@moteurio/client**. Two options:

### Automated (GitHub Actions)

Push a tag that matches the client version to trigger a publish:

```bash
# From repo root, after bumping packages/client/package.json version (e.g. to 0.1.1)
git tag client@0.1.1
git push origin client@0.1.1
```

The workflow `.github/workflows/release-client.yml` runs tests, builds, and runs `npm publish` in `packages/client` when the tag matches `client@*`. Requires `NPM_TOKEN` to be set in the repo secrets.

### Manual

From the repo root:

```bash
pnpm --filter @moteurio/client run build
pnpm --filter @moteurio/client exec -- npm publish --access public
```

Or from `packages/client`:

```bash
cd packages/client
pnpm run build
npm publish --access public
```

Ensure the version in `package.json` is bumped before publishing.

## Questions

Open an issue in [moteurio/moteur](https://github.com/moteurio/moteur) for bugs, feature ideas, or questions.

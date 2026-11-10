# @moteurio/e2e

End-to-end tests for Moteur. They run the golden path through the published `@moteurio/client` against a real server:

1. Sign in with email and password.
2. Create a project and define a model.
3. Save an entry as a draft, then publish it.
4. Find the change in the entry's Git history.
5. Create a channel and a project API key, and read the entry the way a site does.
6. Check that the read-only key cannot write.
7. Delete the project.

This package is private and never published.

## Run against a local server

```bash
pnpm build
pnpm test:e2e
```

The suite starts `packages/api/dist/index.js` on a free port with a temporary data folder, one admin account and an empty home folder, then removes everything when it finishes. It needs `git` on the `PATH`, like any Moteur server.

The variables in the repository's `.env` are blanked for the test server, so a local `.env` never changes what the test sees.

## Run against a deployed server

```bash
MOTEUR_E2E_URL=https://api.example.com \
MOTEUR_E2E_EMAIL=smoke-test@example.com \
MOTEUR_E2E_PASSWORD=… \
pnpm test:e2e
```

The account must be able to sign in with a password and create projects. The suite creates a project named `e2e-<random>` and deletes it at the end, also when a step fails.

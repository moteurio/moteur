# Contributing to Moteur

## Workflow

- Work on a branch (`feat/*`, `fix/*`, `docs/*`) and open a pull request.
- A pull request must pass CI: build, lint and tests.
- For larger changes, open an issue first.

## Setup

Moteur is a pnpm monorepo.

```bash
git clone git@github.com:moteurio/moteur.git
cd moteur
pnpm install
pnpm run prepare   # installs the Husky hooks
```

The pre-commit hook runs lint-staged. The pre-push hook runs `pnpm check:all`.

| Command             | Description                 |
| ------------------- | --------------------------- |
| `pnpm run build`    | Build every package         |
| `pnpm run lint:fix` | Lint and fix every package  |
| `pnpm run test`     | Run the unit tests (Vitest) |

## Code style

- TypeScript, ESM. ESLint and Prettier enforce formatting: 4-space indent, semicolons, single quotes.
- Exported functions have explicit return types.

## Writing: commits, comments, tests

Write for an engineer who has never seen the project. Be concrete, plain and complete.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with an imperative summary that says what the code now does.

```
fix(workspaces): restrict a personal workspace to its owner
feat(operator): list workspaces in the accounts summary
perf(git): batch queued saves into one commit per author
```

Avoid:

- Summaries that describe an outcome without the change: ~~`someone's own workspace is only theirs`~~.
- Internal ticket codes or private references (`c192`, names of other projects). Put context in the PR description.
- Several unrelated changes in one commit.

The body, when needed, explains why the change was made and anything a reviewer would not guess.

### Comments

A comment explains **why** the code does something that is not obvious: a constraint, an edge case, a decision. Don't comment what the code already says.

- Write full sentences with a subject and a verb.
    - Good: `// Use the system font stack so emails don't depend on web fonts.`
    - Avoid: `// The reader's own system font: nothing of the Studio's.`
- Describe the code as it is now. History (`used to`, `no longer`, `now`) belongs in commits.
- Moteur is open source and Moteur Studio is not. Comments and docs describe the API contract, not how Studio uses it.
- Use JSDoc (`/** ... */`) on exported functions and types. Use `//` inside function bodies.

### Test names

A test name states the behaviour under test: `it('returns 404 when the project has no remote')`, not `it('says nothing is owed without a remote')`.

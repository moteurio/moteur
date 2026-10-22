# @moteurio/commands

Everything the [Moteur](https://github.com/moteurio/moteur) API can do, as declared commands. The
[`moteur` CLI](../cli) and the [MCP server](../mcp) are both built on this list, so people and
agents get the same things, named the same way, checked the same way.

A command declares its arguments (with types), what it sends, and the call it makes:

```ts
{
    name: 'publish',
    summary: 'Publish an entry: what is saved now goes live',
    args: [project, modelFirst, entryId],
    http: 'POST /projects/{project}/models/{model}/entries/{id}/publish'
}
```

`execute(command, args, session)` runs one: it fills the path from the arguments, puts the others in
the query or the body as declared, and returns the API's answer. `checkArgs` checks and converts
arguments from text (the command line) or JSON (tool calls). `configSession()` signs in from
`MOTEUR_TOKEN` / `MOTEUR_API_KEY` or `~/.moteur/config.json`, like the CLI.

## Keeping up with the engine

`pnpm coverage` compares the commands with the API's OpenAPI document: every operation needs a
command, or a reason in `SKIPPED` (`src/coverage.ts`). It fails on anything missing, and on commands
calling routes the document doesn't list.

```bash
pnpm build
pnpm coverage                                      # the engine's spec (pnpm openapi:export first)
pnpm coverage http://localhost:3000/openapi.json   # a running API, plugins included
```

Adding a route to the engine: declare its command in `src/commands/`; the CLI, its reference
(`pnpm --filter @moteurio/cli docs`) and the MCP tools follow.

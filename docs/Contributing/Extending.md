# Extending

Much of what a Moteur host can do isn't in the engine at all: sign-in providers, cloud storage, video, search, AI. These come as **plugins**, so the engine stays small and each host loads only what it needs. Before you add something to `core`, ask whether it should be a plugin instead.

## Where extension happens

| You want to…                                                        | Use                                                              | Read                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| React to content changes inside the engine                          | Events on the event bus (`content.saved`, `entry.beforeCreate`…) | `packages/core/src/utils/eventBus.ts`                                                                             |
| Add routes, field types, blocks, storage, sign-in, webhook adapters | An engine plugin                                                 | [Plugin architecture](../Plugin%20architecture.md), [`@moteurio/plugin-sdk`](../../packages/plugin-sdk/README.md) |
| Add field editors, block previews or setup pages to the web app     | A browser companion                                              | [`@moteurio/studio-plugin-sdk`](../../packages/studio-plugin-sdk/README.md)                                       |
| Tell other systems something changed                                | Webhooks                                                         | [Webhooks](../Webhooks.md)                                                                                        |
| Read content from a website                                         | A channel and the client                                         | [Public API and Channels](../Public%20API%20and%20Channels.md), [Frontend](../Frontend.md)                        |

## How the engine uses its own plugin system

The engine is its own first plugin user, which makes it the best example to read:

- `packages/core/src/plugins/registerCorePlugins.ts` loads the built-in plugins (activity log, audit, validation, and a few more) and wires the git commit hook described in [A request, end to end](A%20request,%20end%20to%20end.md#5-git-keeps-the-history).
- `packages/core/src/plugins/contributionCollector.ts` records what each plugin actually registered, so the host can list it.
- `packages/api/src/openapi/bootstrapApi.ts` mounts plugin routes and merges their OpenAPI descriptions with the engine's.

When the server starts (`packages/api/src/index.ts`), it registers the core plugins, loads the host plugins named in `MOTEUR_HOST_PLUGINS`, and then mounts their routes. Plugin routes under `/auth`, `/projects` and `/webhooks` are merged into the engine's own routers.

## Events, briefly

`triggerEvent(name, context)` and `onEvent(name, handler)` in `utils/eventBus.ts` are how parts of the engine talk without importing each other. `entries.ts` doesn't know git exists; it announces `content.saved`, and the git hook commits. Two kinds matter:

- **`before…` events** (`entry.beforeCreate`) are awaited. A handler can change the data or throw to refuse the operation.
- **All other events** (`entry.afterCreate`, `content.saved`…) report what happened. A handler that throws is logged and skipped; it never fails the operation.

The full list of events and their payloads is the `EventMap` type in the same file.

## A new API operation

Every operation the API offers also appears in the OpenAPI document, the CLI and the MCP tools. When you add one:

1. Write the route in `packages/api/src/`, with its `openapi` description in the same file. CI fails on a success response whose body isn't described.
2. Put the rules in `core`, not in the route.
3. Declare its command in `packages/commands/src/commands/`. `pnpm coverage` in `packages/commands` fails on an operation with no command, unless `SKIPPED` in `src/coverage.ts` says why.
4. Regenerate the CLI reference with `pnpm --filter @moteurio/cli docs`. `docs/CLI.md` is generated: never edit it by hand.
5. Add tests next to the area you changed.

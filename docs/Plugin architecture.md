# Plugin architecture

Plugins extend a Moteur host without changing the engine. This guide is the contract for **manifests**, **roles**, **categories**, and **contributions**. Installation and host composition live in [moteur-plugins](https://github.com/moteurio/moteur-plugins/blob/main/docs/Plugins.md). The module API is in [`@moteurio/plugin-sdk`](../packages/plugin-sdk/README.md). Studio companions use [`@moteurio/studio-plugin-sdk`](../packages/studio-plugin-sdk/README.md).

Do not overload **core**:

| Term                   | Meaning                                              | Enablement                                            |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **Engine core**        | Built-ins (`activity-log`, `audit`, `validation`, …) | Always on; operator `kind: core`                      |
| **Platform plugin**    | Host subsystems (`ai`, `billing`, `presence`)        | Host + operator toggle; `role: platform`              |
| **Integration plugin** | Adapters and packs (auth, webhooks, storage, blocks) | Same host enablement; `role` omitted or `integration` |

`role` is catalog metadata. It does not change `scope`, `MOTEUR_HOST_PLUGINS`, or `project.plugins`.

## Manifest checklist

Every host plugin should declare:

| Field                   | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`, `label`, `source` | Identity                                                                                                         |
| `scope`                 | `global` (not gated by `project.plugins`) or `project` (default)                                                 |
| `role`                  | `platform` or `integration` (default)                                                                            |
| `categories`            | Domain tags: `auth`, `webhook`, `content`, `storage`, `video`, `search`, `ai`, `billing`, `presence`, `commerce` |
| `contributes`           | Surfaces the plugin touches (see below)                                                                          |
| `requires`              | Other plugin ids that should be loaded first (host warns if missing)                                             |
| `studio`                | Companion package and field/block/route hints (optional)                                                         |

Deprecated: `capabilities` (`routes` \| `openapi` \| `auth-provider`). Use `contributes.api` and `contributes.auth`.

## Declare + derive

Authors set `categories` and optional `contributes`. During `init()`, the engine records what was actually registered (blocks, fields, adapters, plan limits, events). After `getRoutes` / `getAuthProviders` / `attachServer`, the API adds mounts and auth providers.

**Effective contributions** = merge(`manifest.contributes`, derived). The operator catalog (`GET /operator/plugins`) returns that merge.

## Contribution catalog (shipped today)

| Field                                                     | How it is registered                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `api.mounts`, `api.openApi`, `api.routePaths`             | `getRoutes()`                                                                                                                           |
| `auth.providers`                                          | `getAuthProviders()`                                                                                                                    |
| `webhooks.inbound`                                        | Declare inbound paths (often `/webhooks/…`)                                                                                             |
| `schemas.blocks` / `structures` / `blueprints` / `fields` | `ctx.register*Schema`                                                                                                                   |
| `schemas.blocks` (what sites get)                         | `registerBlockDelivery(type, resolve)`: see below                                                                                       |
| `adapters.storage` / `adapters.video`                     | `registerStorageAdapterFactory` / `registerVideoProviderFactory`                                                                        |
| `video.activeProvider`                                    | `setVideoProvidersConfig`                                                                                                               |
| `search.backend`                                          | Declarative (no core registry)                                                                                                          |
| `extensions.aiProviders`                                  | `registerAIProvider` on `@moteurio/plugin-ai`                                                                                           |
| `planLimits.*`                                            | `setCreditAllowance`, `set*Limit`, `set*Quota`                                                                                          |
| `events.subscribes`                                       | `ctx.onEvent`                                                                                                                           |
| `server.attach`                                           | `attachServer`                                                                                                                          |
| `platform.onlinePresence`                                 | `setOnlineUserIdsProvider` from `@moteurio/core/host.js`                                                                                |
| `studio` / `studioUi`                                     | Manifest hints + Studio companion `register*`                                                                                           |
| `frontend`                                                | Manifest hints + opt-in site package (`contributes.frontend`)                                                                           |
| `commands.cli` / `commands.mcp` / `mcp.tools`             | `registerCommand` / `registerMcpTool`                                                                                                   |
| `media.variants` / `transforms` / `generators`            | `registerMediaVariantPreset` / `registerMediaTransform` / `registerMediaGenerator`                                                      |
| `schemas.models`                                          | `registerModelTemplate`                                                                                                                 |
| `git.commitHooks` / `git.providers`                       | `registerGitCommitHook` / `registerGitProvider`                                                                                         |
| `webhooks.outboundEvents`                                 | `registerOutboundWebhookEvent` (added to the allowed event list)                                                                        |
| `forms.actions` / `fields` / `screens` / `holds`          | `registerFormAction` / `registerFormField` / `registerSubmissionScreen` / `registerSubmissionHold` ([Forms](Forms.md#what-plugins-add)) |

Enablement (`isPluginEnabledForProject`) is not a contribution.

### What sites get for a plugin's blocks

`ctx.registerBlockDelivery(type, resolve)` lets a plugin add to its blocks as channels send them: an embed's HTML from its provider, a poll's counts. `resolve(data, { projectId, locale })` is called for every block of that `type` in an answer, wherever it sits (a body, a page's fields, a block inside a block), with the block's data in the language asked for, and returns the data to send.

It runs when a channel's answer is worked out, then the answer is kept with the rest (see [Public API and Channels](Public%20API%20and%20Channels.md)), so a provider is asked once per change of the project, not once per visitor. A `resolve` that throws, or takes longer than 3 seconds, sends the block as it was: a slow provider never breaks a page. Studio and the members' routes get blocks as stored.

## Layers

```
API host plugin     → routes, init registries, events, attachServer
Studio companion    → field editors, block previews, project/operator nav
Site frameworks     → moteur-frontend repo (@moteurio/react, astro, vue, vanilla); not host plugins
CLI / MCP           → builtins in @moteurio/commands; plugins add more with registerCommand
Media / git         → adapters, variant presets, transforms, generators, git commit hooks
```

Operator sign-in and console pages are composed as a Studio plugin (`@moteurio/studio-plugin-operator`). Geo is the public **full-stack** exemplar: fields, blocks, structures, blueprints, Studio companion.

## Catalog-only (declare on `contributes` until a hook exists)

- `schemas.layouts` / `templates` / `forms` / `menus`
- `operator.api` merge into `/operator`
- `radar.checks`, `schedules.jobKinds`, `validation.hooks`

See [Plugin SDK backlog](Plugin%20SDK%20backlog.md).

## Category ↔ typical contributions

| Category                      | Typical contributions                                    |
| ----------------------------- | -------------------------------------------------------- |
| `auth`                        | `auth.providers`, `api.mounts` `/auth`                   |
| `webhook`                     | `webhooks.inbound`, `/webhooks`                          |
| `content`                     | `schemas.*`, `studio.*`                                  |
| `storage` / `video`           | matching adapters                                        |
| `search`                      | `search.backend`, project search routes, `content.saved` |
| `ai` + `role: platform`       | `/ai`, events; providers add `extensions.aiProviders`    |
| `billing` + `role: platform`  | `planLimits.*`, `/billing`, Stripe webhook               |
| `presence` + `role: platform` | `server.attach`, `platform.onlinePresence`               |

## Studio companions

`manifest.studio` on an API plugin does not load browser code. The Studio host imports companion packages at build time (`applyStudioPlugins`). An API-only host can omit companions.

Companion manifests use the same catalog axes as API plugins (`id`, `label`, `source`, `scope`, `role`, `categories`, `contributes`, `requires`). Pair by `id`. Declare `contributes.studioUi`; `applyStudioPlugins` merges that with field editors, block previews, and routes registered at runtime.

## Geo checklist (complete integration)

A content plugin should typically ship:

1. Field types, blocks, structures
2. Optional blueprint (starter models)
3. Optional API routes
4. `studio.companionPackage` with field editors and block previews
5. CLI/MCP commands when `registerCommand` exists
6. Optional `contributes.frontend` companion (web components for site delivery)

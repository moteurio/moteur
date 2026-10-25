# @moteurio/plugin-sdk

Types and helpers for **authoring Moteur plugins** (blocks, storage, auth, AI providers, etc.). Published plugins target a compatible `@moteurio/core` / API line; see the [`moteur-plugins`](https://github.com/moteurio/moteur-plugins) repo for examples.

Installation, host composition and implementation examples live in the [host plugin guide](https://github.com/moteurio/moteur-plugins/blob/main/docs/Plugins.md). This package owns the engine-facing contract.

## Install

```bash
npm install @moteurio/plugin-sdk
```

Requires Node **22+** (see `engines` in `package.json`).

## Module contract

Export a default object typed as `HostPluginModule`, or use `definePlugin`:

```ts
import { definePlugin } from '@moteurio/plugin-sdk';

export default definePlugin({
    manifest: {
        id: 'example',
        label: 'Example',
        source: 'opensource',
        scope: 'project',
        categories: ['content']
    },
    init(ctx) {
        ctx.onEvent('entry.afterUpdate', async (event: { projectId: string }) => {
            if (!(await ctx.isPluginEnabledForProject(event.projectId, 'example'))) return;
            // Handle the event for this project.
        });
    }
});
```

| Export                      | Responsibility                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `manifest`                  | Stable plugin ID, label, source, optional `role` / `categories` / `contributes` / `requires` / Studio hints |
| `init(ctx)`                 | Register events, schemas, commands, media pipeline, git hooks, adapter factories                            |
| `getRoutes(ctx)`            | Optional `{ path, router, openapi? }` contribution, or an array                                             |
| `getAuthProviders()`        | Optional browser sign-in provider descriptors                                                               |
| `attachServer(server, app)` | Optional attachment after the host creates its HTTP server                                                  |

`PluginInitContext` and `HostPluginModule` are defined in [src/index.ts](src/index.ts). Route and manifest shapes are in [Plugin.ts](../types/src/Plugin.ts). Roles, categories and contributions are documented in [Plugin architecture](../../docs/Plugin%20architecture.md). Routes mount below `API_BASE_PATH`; their schemas merge into the host's OpenAPI document.

During `init`, plugins may also call:

| Hook                                            | Result                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `registerCommand` / `registerMcpTool`           | CLI words and MCP tools (`GET /commands`; hosted `/mcp` merges them) |
| `registerMediaVariantPreset`                    | Named image-size sets offered in media settings                      |
| `registerMediaTransform`                        | Runs on upload (`source`) or each generated copy (`perVariant`)      |
| `registerMediaGenerator`                        | `runMediaGenerator` on the host surface (QR is the exemplar)         |
| `registerModelTemplate`                         | Reusable model schema (`schemas.models`)                             |
| `registerGitCommitHook` / `registerGitProvider` | After a content commit; catalog of git providers                     |
| `registerOutboundWebhookEvent`                  | Extra event names the webhook API accepts                            |

## Scope and permissions

`global` plugins ignore `project.plugins`. Project scope is the default: handlers check `isPluginEnabledForProject` before running for a project. An unset project allowlist permits host-enabled project plugins; a list limits them to those IDs.

Enablement does not authenticate a request. `PluginRouteContext` provides `requireAuth`, `requireProjectAccess` and `requireOperator`. After project access, `req.user.roles` carries project roles. Use engine service authorization for the operation and operator authentication for platform administration. See [Authentication](../../docs/Authentication.md).

## Dependencies and engine access

Use compatible `@moteurio/core`, `@moteurio/types` and `@moteurio/plugin-sdk` peer dependencies, with development dependencies for builds. The API and plugins must use one core instance so events, settings and registries agree.

Import engine services only from `@moteurio/core/host.js`, the supported [host surface](../core/src/host.ts). Other core modules are internal. Browser editors and previews use the separate [Studio plugin SDK](../studio-plugin-sdk/README.md); companion manifests use the same catalog axes (`id`, `label`, `source`, `scope`, `role`, `categories`, `contributes`, `requires`). API manifest hints alone do not install UI code.

## Lifecycle errors

Before-create/update/delete handlers are awaited before persistence and may reject an operation. User mutation helpers are asynchronous too: await their results. Keep validators bounded. After-event handlers are isolated and logged so notification failures do not undo successful writes or become unhandled rejections.

OAuth plugins use `startProviderSignIn` from the host surface and `redirectProviderSignIn` from this SDK after validating provider identity. The helper preserves browser binding for verification/linking continuations; do not replace them with email-only account matching. Signed state preserves an explicit `link=1` intent. See [Authentication](../../docs/Authentication.md).

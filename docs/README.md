# Moteur documentation

These guides describe the engine in this repository: content modeling, delivery, authoring, configuration and tools. The running host's OpenAPI document is the reference for its exact routes, including any optional plugins.

## Start here

| Goal                                | Read                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Understand the content system       | [Content modeling](Content%20modeling.md)                                                                               |
| Read content from a website or SSG  | [Public API and Collections](Public%20API%20and%20Collections.md), then the [HTTP client](../packages/client/README.md) |
| Build pages and menus               | [Pages and navigation](Pages%20and%20navigation.md)                                                                     |
| Run or restore an API host          | [Operations](Operations.md) and [Configuration](Configuration.md)                                                       |
| Authenticate people or applications | [Authentication](Authentication.md)                                                                                     |
| Work from a terminal or AI client   | [CLI](CLI.md) and [MCP](MCP.md)                                                                                         |

## Content and editorial work

| Guide                                               | Covers                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| [Content modeling](Content%20modeling.md)           | Models, entries, structures, templates, layouts, languages and safe updates |
| [Fields](Fields.md)                                 | Built-in field types, options and value shapes                              |
| [Blocks](Blocks.md)                                 | Block schemas and instances                                                 |
| [Pages and navigation](Pages%20and%20navigation.md) | Page trees, model-bound pages, menus and site outputs                       |
| [Entry queries](Entry%20queries.md)                 | Pagination, sorting, search, filters, counts and missing translations       |
| [Media](Media.md)                                   | Uploads, asset references, processing, usage and the bin                    |
| [Images](Images.md)                                 | Crops, focal points, resizing, caching and client helpers                   |
| [Forms](Forms.md)                                   | Visitor submissions, actions, notifications and the private inbox           |
| [Workflows](Workflows.md)                           | Reviews, approvals, publication and unpublished edits                       |
| [Scheduling](Scheduling.md)                         | Timed publication/unpublication and execution requirements                  |
| [Schema revisions](Schema%20revisions.md)           | Schema history, restore and consequences for existing content               |
| [Blueprints](Blueprints.md)                         | Starting points for projects and schemas                                    |
| [Seeds](Seeds.md)                                   | Built-in blueprint seeds                                                    |

## Integration and tools

| Guide                                                             | Covers                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| [Public API and Collections](Public%20API%20and%20Collections.md) | Delivery channels, exposed resources and read-only project keys |
| [REST API](REST%20API.md)                                         | Engine HTTP routes and OpenAPI export                           |
| [HTTP client](../packages/client/README.md)                       | Typed JavaScript/TypeScript access over HTTP                    |
| [Embedded core API](Developer%20API.md)                           | In-process engine access for tools and contributors             |
| [CLI](CLI.md)                                                     | Command reference                                               |
| [MCP](MCP.md)                                                     | Local stdio, hosted HTTP, credentials and agent restrictions    |
| [Webhooks](Webhooks.md)                                           | Events, signing, filtering and delivery                         |
| [Starters](Starters.md)                                           | Frontend starter repositories                                   |
| [Frontend](Frontend.md)                                           | Delivery SDKs, preview tokens, plugin web components            |

## Hosting and extension boundaries

| Guide                                                           | Covers                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Operations](Operations.md)                                     | Persistent storage, index rebuilds, single-writer hosting and backup/restore |
| [Configuration](Configuration.md)                               | Engine environment variables and host plugin selection                       |
| [Authentication](Authentication.md)                             | JWTs, project permissions, API keys and operators                            |
| [Git](Git.md)                                                   | Content history, branches and workspace/user-data snapshots                  |
| [Plugin architecture](Plugin%20architecture.md)                 | Roles, categories, contributions, declare vs derive                          |
| [Plugin SDK backlog](Plugin%20SDK%20backlog.md)                 | Planned hooks (commands, models, media, git, operator API)                   |
| [Plugin SDK](../packages/plugin-sdk/README.md)                  | The engine-owned API extension contract                                      |
| [Studio plugin SDK](../packages/studio-plugin-sdk/README.md)    | The engine-owned browser extension contract                                  |
| [Versioning](../VERSIONING.md) and [releasing](../RELEASING.md) | Package compatibility and release procedure                                  |

Plugin installation and authoring guidance lives in [moteur-plugins](https://github.com/moteurio/moteur-plugins/blob/main/docs/Plugins.md). AI and Socket.IO presence are optional private plugins; their runtime manuals live with their implementations in `moteur-plugins-extra`. They are not bundled engine APIs.

The API serves Scalar at `{API_BASE_PATH}/docs` and its merged schema at `{API_BASE_PATH}/openapi.json`. The hosted [API reference](https://docs.api.moteur.io) describes the production host's plugin composition, which can differ from an engine-only installation.

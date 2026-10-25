# Plugin SDK backlog

Hooks not yet on `PluginInitContext`. Manifests may still declare them on `contributes`.

| Hook                                     | Contribution           | Notes                                                       |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| Layout / template / form / menu catalogs | `schemas.layouts` etc. | Blueprints and `registerModelTemplate` cover starters today |
| Operator router merge                    | `operator.api`         | Plugins use `requireOperator` on their own mounts           |
| Radar checks                             | `radar.checks`         |                                                             |
| Schedule job kinds                       | `schedules.jobKinds`   |                                                             |
| Named validators                         | `validation.hooks`     | `onEvent` `*.before*` is the current escape hatch           |

Shipped: `registerCommand` / `registerMcpTool`, media variant presets / transforms / generators, `registerModelTemplate`, `registerGitCommitHook` / `registerGitProvider`, `registerOutboundWebhookEvent`.

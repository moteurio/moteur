# MCP

`@moteurio/mcp` exposes Moteur commands as Model Context Protocol tools. Use it locally over stdio or through the API's hosted Streamable HTTP endpoint. It shares command declarations with the CLI. Plugins add more with `registerCommand` / `registerMcpTool`; the hosted `/mcp` server merges those at request time (`GET /commands` lists them). Stdio MCP still filters by the API's OpenAPI document.

## Local stdio

Sign in with the CLI and select a project:

```bash
npm install -g @moteurio/cli
moteur auth login
moteur projects use my-project
```

Configure an MCP client to launch:

```json
{
    "mcpServers": {
        "moteur": {
            "command": "npx",
            "args": ["-y", "@moteurio/mcp", "--project", "my-project"]
        }
    }
}
```

The process can also use `MOTEUR_API_URL` with `MOTEUR_TOKEN` or `MOTEUR_API_KEY`. A project API key remains read-only and limited to delivery routes; use a member token for authoring. See [Authentication](Authentication.md).

## Hosted HTTP

The current API checkout serves `/mcp` with Bearer-token authentication. Add `API_BASE_PATH` when configured. Use a client that supports an `Authorization: Bearer <token>` header, or use the local stdio process instead. This implementation does not expose MCP OAuth discovery/dynamic registration or account signup; an OAuth-only connection flow cannot configure it automatically.

An agent token can be created with `moteur auth agent-token <name>`. Add `?project=my-project` to choose a default project. The hosted transport accepts POST requests; GET and DELETE return 405 because it keeps no SSE stream or persistent MCP session. `MOTEUR_MCP=off` disables the hosted endpoint.

## Scope and publication

By default, tools act as a review-only agent for the signed-in person. History and assisted-text metadata identify the agent, and publication still needs human approval or publication. The CLI's `--allow-publish` token option lifts that agent restriction; project role and workflow checks continue to apply. An agent cannot approve its own review.

| Local option             | Hosted query           | Purpose                                                |
| ------------------------ | ---------------------- | ------------------------------------------------------ |
| `--project <id>`         | `project=<id>`         | Default project for tools that omit one                |
| `--read-only`            | `readOnly=1`           | Offer only reading tools                               |
| `--groups entries,media` | `groups=entries,media` | Limit command groups                                   |
| `--allow-destructive`    | `allowDestructive=1`   | Include destructive tools                              |
| `--all`                  | `all=1`                | Include normally omitted groups, including billing     |
| `--compact`              | `compact=1`            | Use find/describe/run tools instead of one per command |

These tool-selection options do not grant API permissions or create scoped credentials. The server still checks the token and project access for calls. Operator commands are excluded. Use `projects_describe` to discover a project's schemas, languages and workflow before editing.

See the [MCP package README](../packages/mcp/README.md) for client examples, [CLI](CLI.md) for the command catalog, and [Workflows](Workflows.md) for publication behavior.

Agent/delegated tokens inherit their parent session deadline and authentication time. Ending the parent session or changing credentials invalidates them; agents cannot refresh tokens or perform recent-person account-linking operations.

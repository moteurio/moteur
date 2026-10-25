# @moteurio/mcp

[Moteur](https://github.com/moteurio/moteur) for AI agents: an [MCP](https://modelcontextprotocol.io)
server with a tool for everything the Moteur API can do, from listing entries to publishing, reviews,
schedules, media, menus and AI help. The tools are generated from the same declarations as the
`moteur` CLI ([@moteurio/commands](../commands)), so both always offer the same things.

Engine guide: [MCP](../../docs/MCP.md), including current hosted authentication and tool-selection limits.

## Set up

Sign in once with the CLI (or set `MOTEUR_API_URL` with `MOTEUR_TOKEN` or `MOTEUR_API_KEY`):

```bash
npm install -g @moteurio/cli
moteur auth login
moteur projects use my-project        # the default project
```

Claude Code:

```bash
claude mcp add moteur -- npx -y @moteurio/mcp
```

Claude Desktop, or any MCP client (`mcpServers`):

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

## Hosted: `/mcp` on every Moteur API

Every Moteur API serves the same tools over Streamable HTTP at `/mcp` (on Moteur's cloud:
`https://api.moteur.io/mcp`). Add that URL in your assistant, then choose **Connect** or **Sign in**.
Studio opens so you can sign in, or create an account by continuing with an enabled provider
(such as GitHub or Google). Review the assistant's access and connect; your client keeps and renews
its credentials automatically. No copying tokens.

Codex:

```bash
codex mcp add moteur --url https://api.moteur.io/mcp
codex mcp login moteur
```

Claude Code:

```bash
claude mcp add --transport http moteur https://api.moteur.io/mcp
# Open /mcp in Claude Code and authenticate Moteur.
```

Then ask: “Show my projects”, or “Create my first project, a bilingual recipe site.” Your assistant
can list projects, create one within your account limits, choose a blueprint, and help set up
models and draft content. Sign-in and account creation happen in the browser, so you never give
your password to an assistant. Hosts without provider sign-up can invite people through Studio.

During connection, select the individual projects to share and an access level:

| Access             | What the assistant can do                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Read-only          | Read content and inspect the selected projects' structure.                                                                  |
| Content editing    | Read and edit content, media, pages and editorial work; inspect schemas. No schema, settings, people or credential changes. |
| Full project setup | Manage the selected projects' content, schemas, settings and access within your existing roles. Payments remain in Studio.  |

Project creation is a separate opt-in under full project setup. A new account can choose it
without selecting an existing project. Projects created by this connection are added to its
permissions automatically; other existing and future projects are never added automatically.

Connections always act as an agent and require a person to approve publishing. Access tokens last one
hour and refresh automatically for up to 30 days; reconnect afterwards. In Studio's account menu,
**AI connections** lists your connections and lets you change projects/access levels or disconnect
one immediately. The server rechecks permissions on every call, including compact tools and actual
API requests, and always applies your current account membership and project roles. If an assistant
caches its tool list, refresh its tools to see newly enabled actions after changing access levels.
Credentials issued before project selection was introduced must be reconnected or have permissions
chosen in Studio; they do not silently retain unrestricted access.

Hosted OAuth tools cannot read or write files on the API host. For local-file uploads, replacements
or exports to disk, use the local stdio server with the CLI sign-in instead.

For clients that take a manually supplied token instead:

```bash
moteur auth agent-token Claude          # lasts up to 8 hours; --allow-publish to let it publish
claude mcp add --transport http moteur "https://api.moteur.io/mcp?project=my-project" \
    --header "Authorization: Bearer <token>"
```

The query takes the same choices as the options below: `groups=entries,media`, `readOnly=1`,
`allowDestructive=1`, `all=1`, `compact=1`, `project=<id>`. A self-hosted API can leave it out with
`MOTEUR_MCP=off`.

### Hosting browser sign-in

Set these on the API and deploy a Studio build with the MCP connection pages:

```dotenv
MOTEUR_MCP_PUBLIC_URL=https://api.example.com/mcp
STUDIO_URL=https://studio.example.com
AUTH_REDIRECT_AFTER_LOGIN=https://studio.example.com/auth/callback
CORS_ORIGINS=https://studio.example.com
```

Include `API_BASE_PATH` in `MOTEUR_MCP_PUBLIC_URL` when used, e.g. `https://api.example.com/v1/mcp`.
Use HTTPS in production; HTTP is accepted only on loopback for development. The API never derives
these public URLs from request headers. Configure your existing auth providers as usual to let new
people create accounts. An account has no access to someone else's projects until invited.

The API serves OAuth discovery at the origin root (`/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource/<MCP path>`), plus `/register`, `/authorize`, `/token`, and
`/revoke`. Route these paths to the API as well as its base path. Registration supports public and
client-secret-post clients; authorization requires S256 PKCE, a registered callback, and explicit
Studio consent. Tokens are bound to this MCP server and cannot be used as Studio/API login tokens.
Refresh tokens rotate; reuse revokes the connection. Existing CLI and manually supplied tokens
continue to work. OAuth is enabled when both public MCP and Studio URLs are configured.

OAuth records live in `$DATA_ROOT/data/mcp-oauth/oauth.json` with owner-only permissions. Keep
that directory on the same durable disk as users and projects and in protected backups. As with
Moteur's other file-backed data, run one API writer process on one host; separate machines with independent volumes
cannot share connections. Grants survive API restarts. Codes, access tokens, and refresh tokens
are stored as hashes. OAuth client secrets are kept in the private file for client authentication.

## Acting for you

The tools act as an agent for the person signed in, and the API treats it as one:

- What it changes reads “Louise via Claude” in history, activity and comments.
- The fields it writes are marked, like the Studio's writing help, until a person reads them.
- It can ask for reviews but never approve them, and what it changes goes live only once a person
  approves it (or, in a project without reviews, publishes it). `--allow-publish` (or
  `moteur auth agent-token --allow-publish`) lifts that; the project's own review rules still apply.

The agent's name is the client's (“Claude Code”), or `--agent-name`.

## What it offers

By default: a tool per command for reading and ordinary changes (175 tools). Agents should start
with `projects_describe`: the project's languages, how content goes live, and every model's fields
in one answer. Tools that can't be
undone (deleting, purging, merging branches, moving storage) are off; so are billing and raw API
calls. Operator commands are never tools: running the whole server takes an operator's own sign-in
(password and authenticator), not an agent's.

| Option                           |                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `--read-only`                    | reading tools only                                                                                                               |
| `--allow-destructive`            | also tools that can't be undone (the client still asks you)                                                                      |
| `--groups entries,media,reviews` | only these groups                                                                                                                |
| `--all`                          | every group, billing included (never operator commands)                                                                          |
| `--compact`                      | three tools (`moteur_find`, `moteur_describe`, `moteur_run`) that reach every command, for clients that struggle with many tools |
| `--project <id>`                 | the project when a call names none                                                                                               |
| `--list`                         | print the tools and exit                                                                                                         |

Each tool's schema comes from the command's arguments; tools are marked read-only or destructive
(MCP annotations) as the command declares. Errors come back as tool errors with the API's message
("Entry “x” not found…", "model is required").

Tool names follow the commands: `moteur entries publish` is `entries_publish`,
`moteur media-settings get` is `media_settings_get`. The full list with arguments:
[docs/CLI.md](../../docs/CLI.md).

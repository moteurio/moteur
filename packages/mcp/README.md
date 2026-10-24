# @moteurio/mcp

[Moteur](https://github.com/moteurio/moteur) for AI agents: an [MCP](https://modelcontextprotocol.io)
server with a tool for everything the Moteur API can do, from listing entries to publishing, reviews,
schedules, media, menus and AI help. The tools are generated from the same declarations as the
`moteur` CLI ([@moteurio/commands](../commands)), so both always offer the same things.

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
`https://api.moteur.io/mcp`), for clients that connect to remote servers. Until sign-in with OAuth
arrives, give the client a token:

```bash
moteur auth agent-token Claude          # lasts up to 8 hours; --allow-publish to let it publish
claude mcp add --transport http moteur "https://api.moteur.io/mcp?project=my-project" \
    --header "Authorization: Bearer <token>"
```

The query takes the same choices as the options below: `groups=entries,media`, `readOnly=1`,
`allowDestructive=1`, `all=1`, `compact=1`, `project=<id>`. A self-hosted API can leave it out with
`MOTEUR_MCP=off`.

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

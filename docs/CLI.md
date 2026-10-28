# Moteur CLI reference

<!-- Generated from packages/cli/src/commands by `pnpm --filter @moteurio/cli docs`. Edit the declarations, not this file. -->

`moteur` drives a Moteur API from scripts, CI and agents. Every command takes `--json` (the API’s answer as JSON), `--quiet`, `--yes` (no questions before changes that can’t be undone), `--debug`, and `--project <id>` where it works on a project (default: `MOTEUR_PROJECT`, `.moteur.json`, or `moteur projects use <id>`). Anything without a command: `moteur api <METHOD> <path>`.

Install: `npm install -g @moteurio/cli`. Sign in: `moteur auth login`. The Studio in your terminal is a separate package: `@moteurio/studio-cli` (`moteur-studio`).

## auth

### `moteur auth login`

Sign in to a Moteur API and remember it

| Option                |                                                             |
| --------------------- | ----------------------------------------------------------- |
| `--api-url <string>`  | The API (default: the last one, or http://localhost:3000)   |
| `--email <string>`    | Your email                                                  |
| `--password <string>` | Your password (asked when left out)                         |
| `--code <string>`     | With two-step sign-in: the app’s code (asked when left out) |

### `moteur auth logout`

Forget the sign-in

### `moteur auth create-user`

Create an account straight in a local server’s files (no API)

Runs where the server’s data is (DATA_ROOT / AUTH_USERS_FILE). To add someone through the API, use moteur invites send. Operators are not users: add them with moteur-operators on the server.

| Option                |                          |
| --------------------- | ------------------------ |
| `--email <string>`    | Their email              |
| `--password <string>` | Their password           |
| `--name <string>`     | Their name               |
| `--project <string>`  | Add them to this project |

### `moteur auth reset-password`

Set a password straight in a local server’s files (no API)

| Option                |                  |
| --------------------- | ---------------- |
| `--user <string>`     | Email or user id |
| `--password <string>` | The new password |

### `moteur auth whoami`

Who you are signed in as, and where

Calls `GET /auth/me`.

### `moteur auth providers`

The sign-in options the server offers

Calls `GET /auth/providers`.

### `moteur auth refresh`

Swap the remembered token for a fresh one

### `moteur auth agent-token [name]`

A token for an AI agent acting for you (for the hosted MCP at /mcp)

What the agent changes reads “<you> via <name>”, is marked until a person reads it, and goes live only once a person approves it, unless --allow-publish. Lasts up to 8 hours.

| Option             |                                                          |
| ------------------ | -------------------------------------------------------- |
| `--name <string>`  | Who its changes are marked as made by (default `Claude`) |
| `--allow-publish`  | Let its changes go live without a person approving them  |
| `--hours <number>` | How long it lasts, up to 8 (default `8`)                 |

## operator

### `moteur operator login`

Sign in as an operator (password and authenticator code), for an hour

| Option               |                                             |
| -------------------- | ------------------------------------------- |
| `--api-url <string>` | The API (default: the one you signed in to) |
| `--email <string>`   | Your operator email                         |

### `moteur operator logout`

End the operator session on this machine

### `moteur operator whoami`

Which operator is signed in here, and until when

### `moteur operator operators`

The operators: who runs this server

Calls `GET /operator/operators`.

### `moteur operator add-operator <email>`

Add an operator; prints their one-time link (24 hours)

| Option             |                        |
| ------------------ | ---------------------- |
| `--email <string>` | Their email (required) |
| `--name <string>`  | Their name             |

Calls `POST /operator/operators`.

### `moteur operator reset-operator <id>`

Start an operator’s sign-in again (lost phone): ends their sessions, new link Asks first (or `--yes`).

| Option          |                                                        |
| --------------- | ------------------------------------------------------ |
| `--id <string>` | Their id (moteur operator operators --json) (required) |

Calls `POST /operator/operators/{id}/reset`.

### `moteur operator remove-operator <id>`

Remove an operator; their sessions end at once Asks first (or `--yes`).

| Option          |                     |
| --------------- | ------------------- |
| `--id <string>` | Their id (required) |

Calls `DELETE /operator/operators/{id}`.

### `moteur operator summary`

The whole server at a glance

Calls `GET /operator/summary`.

### `moteur operator users`

Every account

Calls `GET /operator/users`.

### `moteur operator reset-two-factor <id>`

Turn off someone’s two-step sign-in (lost phone and codes) Asks first (or `--yes`).

| Option          |                    |
| --------------- | ------------------ |
| `--id <string>` | User id (required) |

Calls `POST /operator/users/{id}/two-factor/reset`.

### `moteur operator update-user <id>`

Change an account (JSON, or active and roles)

| Option            |                                   |
| ----------------- | --------------------------------- |
| `--id <string>`   | User id (required)                |
| `--active`        | Account on (--no-active: off)     |
| `--roles <list>`  | Account roles                     |
| `--file <string>` | Read the JSON body from this file |
| `--data <string>` | The JSON body, inline             |

Calls `PATCH /operator/users/{id}`.

### `moteur operator projects`

Every project on the server

Calls `GET /operator/projects`.

### `moteur operator project-plugins <project>`

Set which plugins a project may use (JSON)

| Option               |                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) (required) |
| `--file <string>`    | Read the JSON body from this file                                                       |
| `--data <string>`    | The JSON body, inline                                                                   |

Calls `PATCH /operator/projects/{project}`.

### `moteur operator plugins`

Every plugin the server knows of

Calls `GET /operator/plugins`.

### `moteur operator plugin <id>`

Switch a host plugin on or off

| Option          |                                   |
| --------------- | --------------------------------- |
| `--id <string>` | Plugin id (required)              |
| `--enabled`     | On (--no-enabled: off) (required) |

Calls `PATCH /operator/plugins/{id}`.

### `moteur operator schemas <kind>`

Server-wide blocks or structures

| Option                        |                                 |
| ----------------------------- | ------------------------------- |
| `--kind <blocks\|structures>` | blocks or structures (required) |

Calls `GET /operator/schemas/{kind}`.

### `moteur operator put-schema <kind> <name>`

Add or change a server-wide block or structure (JSON)

| Option                        |                                   |
| ----------------------------- | --------------------------------- |
| `--kind <blocks\|structures>` | blocks or structures (required)   |
| `--name <string>`             | Its name (required)               |
| `--file <string>`             | Read the JSON body from this file |
| `--data <string>`             | The JSON body, inline             |

Calls `PUT /operator/schemas/{kind}/{name}`.

### `moteur operator delete-schema <kind> <name>`

Remove a server-wide block or structure Asks first (or `--yes`).

| Option                        |                                 |
| ----------------------------- | ------------------------------- |
| `--kind <blocks\|structures>` | blocks or structures (required) |
| `--name <string>`             | Its name (required)             |

Calls `DELETE /operator/schemas/{kind}/{name}`.

### `moteur operator plans`

Every plan: limits, features, availability (billing)

Calls `GET /billing/operator/plans`.

### `moteur operator update-plan <id>`

Change a plan’s limits, features or availability (JSON)

| Option            |                                   |
| ----------------- | --------------------------------- |
| `--id <string>`   | Plan id (required)                |
| `--file <string>` | Read the JSON body from this file |
| `--data <string>` | The JSON body, inline             |

Calls `PATCH /billing/operator/plans/{id}`.

### `moteur operator billing`

Every project’s plan and extras

Calls `GET /billing/operator/projects`.

### `moteur operator revenue`

Monthly recurring revenue, and what Stripe collected

Calls `GET /billing/operator/revenue`.

### `moteur operator requests`

API request counts (Studio and public)

Calls `GET /studio/usage`.

### `moteur operator seed`

Copy the blueprint seeds into the server’s blueprints

| Option        |                         |
| ------------- | ----------------------- |
| `--overwrite` | Replace ones that exist |

Calls `POST /studio/seed`.

## status

### `moteur status`

The default project, the API, and the models in it

## projects

### `moteur projects list`

Your projects

Calls `GET /projects`.

### `moteur projects get [project]`

Show a project and its settings

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}`.

### `moteur projects describe [project]`

A project’s shape in one answer: languages, how content goes live, your roles, every model’s fields

Start here before reading or writing content: each field in a line (type, per language, required, choices).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

### `moteur projects create [id]`

Create a project (JSON, or an id and a label)

| Option                 |                                   |
| ---------------------- | --------------------------------- |
| `--id <string>`        | Its id (letters, digits, -)       |
| `--label <string>`     | Its name                          |
| `--language <string>`  | Default language (fr, en…)        |
| `--languages <list>`   | Other languages                   |
| `--blueprint <string>` | Start from this project blueprint |
| `--file <string>`      | Read the JSON body from this file |
| `--data <string>`      | The JSON body, inline             |

Calls `POST /projects`.

### `moteur projects update [project]`

Change a project’s settings (JSON with the fields to change, or a new label)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--label <string>`   | New name                                                                     |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}`.

### `moteur projects delete [project]`

Delete a project Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `DELETE /projects/{project}`.

### `moteur projects use <id>`

Make a project the default for every command

| Option          |                       |
| --------------- | --------------------- |
| `--id <string>` | Project id (required) |

### `moteur projects usage [project]`

This month’s use: entries, storage, requests, AI

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/usage`.

### `moteur projects limits [project]`

What the project’s plan allows

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/limits`.

## entries

### `moteur entries list <model>`

List a model’s entries: search, filter, sort, page

| Option                   |                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `--project <string>`     | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`)                   |
| `--model <string>`       | Model id (required)                                                                            |
| `--q <string>`           | Words to find in the id and short text fields                                                  |
| `--status <list>`        | Only these states: draft, in_review, published, unpublished, edits                             |
| `--filter <list>`        | field=value (repeat for more; several values of one field match any)                           |
| `--missing <string>`     | Entries missing languages in a field: title:fr,en                                              |
| `--sort <string>`        | updatedAt, createdAt, publishedAt, id or data.<field>; - for descending (default `-updatedAt`) |
| `--sort-locale <string>` | Language for a data.<field> sort                                                               |
| `--facets <list>`        | Count matching entries per value of these keys                                                 |
| `--fields <list>`        | Only these data fields                                                                         |
| `--group <string>`       | Group rows by this key                                                                         |
| `--limit <number>`       | How many to return (0: only the total) (default `50`)                                          |
| `--offset <number>`      | How many to skip                                                                               |

```bash
moteur entries list article --q glace
moteur entries list article --status in_review --filter author=sophie --json
```

### `moteur entries get <model> <id>`

Show one entry

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | Entry id (required)                                                          |

Calls `GET /projects/{project}/models/{model}/entries/{id}`.

### `moteur entries create <model> [id]`

Create an entry from its JSON ({ id, data, … }) and/or fields to set

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | The new entry’s id                                                           |
| `--status <string>`  | draft (default) or published                                                 |
| `--set <list>`       | A field to set: field=value (title.en=Hello, readingTime=5); repeat for more |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

```bash
moteur entries create article --id glace --set title.fr="Sous la glace"
moteur entries create article --file entry.json
```

### `moteur entries update <model> <id>`

Change fields of an entry: fields to set (title.en=…), or JSON { data: {…} }

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | Entry id (required)                                                          |
| `--set <list>`       | A field to set: field=value (title.en=Hello, readingTime=5); repeat for more |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

```bash
moteur entries update article glace --set title.en="Under the ice"
```

### `moteur entries delete <model> <id>`

Delete an entry Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | Entry id (required)                                                          |

Calls `DELETE /projects/{project}/models/{model}/entries/{id}`.

### `moteur entries publish <model> <id>`

Publish an entry: what is saved now goes live

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | Entry id (required)                                                          |

Calls `POST /projects/{project}/models/{model}/entries/{id}/publish`.

### `moteur entries status <model> <id> <to>`

Set an entry’s state (draft, in_review, published, unpublished)

| Option                                            |                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`                              | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`                                | Model id (required)                                                          |
| `--id <string>`                                   | Entry id (required)                                                          |
| `--to <draft\|in_review\|published\|unpublished>` | The new state (required)                                                     |

Calls `PATCH /projects/{project}/models/{model}/entries/{id}/status`.

### `moteur entries unpublish <model> <id>`

Take an entry offline (it stays as it is) Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | Entry id (required)                                                          |

### `moteur entries review <model> <id>`

Ask for a review of an entry

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`    | Model id (required)                                                          |
| `--id <string>`       | Entry id (required)                                                          |
| `--reviewer <string>` | Someone in particular (user id)                                              |

Calls `POST /projects/{project}/models/{model}/entries/{id}/submit-review`.

### `moteur entries history <model> <id>`

The saved versions of an entry, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--id <string>`      | Entry id (required)                                                          |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/models/{model}/entries/{id}/revisions`.

### `moteur entries version <model> <id> <revision>`

An entry as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`    | Model id (required)                                                          |
| `--id <string>`       | Entry id (required)                                                          |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/models/{model}/entries/{id}/revisions/{revision}`.

### `moteur entries restore <model> <id> <revision>`

Bring a saved version of an entry back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`    | Model id (required)                                                          |
| `--id <string>`       | Entry id (required)                                                          |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/models/{model}/entries/{id}/revisions/{revision}/restore`.

## models

### `moteur models list`

List the models

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/models`.

### `moteur models get <model>`

Show one model

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | model id (required)                                                          |

Calls `GET /projects/{project}/models/{model}`.

### `moteur models create`

Create a model from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/models`.

```bash
moteur models create --file=model.json
```

### `moteur models update <model>`

Change part of a model (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | model id (required)                                                          |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/models/{model}`.

### `moteur models delete <model>`

Delete a model Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | model id (required)                                                          |

Calls `DELETE /projects/{project}/models/{model}`.

### `moteur models history <model>`

The saved versions of a model, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/models/{model}/revisions`.

### `moteur models version <model> <revision>`

A model as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`    | Model id (required)                                                          |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/models/{model}/revisions/{revision}`.

### `moteur models restore <model> <revision>`

Bring a saved version of a model back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`    | Model id (required)                                                          |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/models/{model}/revisions/{revision}/restore`.

## reviews

### `moteur reviews list`

Reviews: waiting, approved, sent back

| Option                                   |                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`                     | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--status <pending\|approved\|rejected>` | Only these                                                                   |
| `--model <string>`                       | Only this model’s entries                                                    |
| `--entry <string>`                       | Only this entry                                                              |

Calls `GET /projects/{project}/reviews`.

```bash
moteur reviews list --status pending
```

### `moteur reviews get <id>`

Show one review

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Review id (required)                                                         |

Calls `GET /projects/{project}/reviews/{id}`.

### `moteur reviews approve <id>`

Approve a review: the entry is published

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Review id (required)                                                         |

Calls `POST /projects/{project}/reviews/{id}/approve`.

### `moteur reviews reject <id>`

Send it back with a note for the asker

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Review id (required)                                                         |
| `--reason <string>`  | What should change (becomes a note on the entry)                             |

Calls `POST /projects/{project}/reviews/{id}/reject`.

## schedules

### `moteur schedules list`

Publishing and unpublishing to come (and past)

| Option                          |                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`            | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--status <string>`             | pending, processing, done, failed or cancelled (comma for several)           |
| `--action <publish\|unpublish>` | Only publish or unpublish                                                    |
| `--kind <entry\|page>`          | Only entries or pages                                                        |
| `--resource <string>`           | Only this entry or page id                                                   |

Calls `GET /projects/{project}/schedules`.

### `moteur schedules get <id>`

Show one schedule

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Schedule id (required)                                                       |

Calls `GET /projects/{project}/schedules/{id}`.

### `moteur schedules create <action> <id>`

Publish or unpublish an entry or a page at a given time

| Option                          |                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`            | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--action <publish\|unpublish>` | publish or unpublish (required)                                              |
| `--kind <entry\|page>`          | entry or page (default `entry`)                                              |
| `--model <string>`              | The entry’s model (for entries)                                              |
| `--id <string>`                 | Entry or page id (required)                                                  |
| `--at <string>`                 | When: an ISO date and time (2026-11-13T09:00:00-05:00) (required)            |

Calls `POST /projects/{project}/schedules`.

```bash
moteur schedules create publish glace --model article --at 2026-11-13T09:00:00-05:00
```

### `moteur schedules cancel <id>`

Cancel a schedule that hasn’t run

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Schedule id (required)                                                       |

Calls `POST /projects/{project}/schedules/{id}/cancel`.

### `moteur schedules delete <id>`

Delete a schedule from the list Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Schedule id (required)                                                       |

Calls `DELETE /projects/{project}/schedules/{id}`.

## comments

### `moteur comments list <on>`

Notes on an entry or a page

| Option                 |                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `--on <string>`        | What it’s about: model/entry (article/glace), or a page id with --kind page (required) |
| `--kind <entry\|page>` | entry (default) or page (default `entry`)                                              |
| `--field <string>`     | A field of it (title, body.0)                                                          |
| `--project <string>`   | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`)           |
| `--resolved`           | Include the ones marked done                                                           |

```bash
moteur comments list article/glace
```

### `moteur comments add <on> <text>`

Leave a note on an entry, a page, or one of their fields

| Option                 |                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `--on <string>`        | What it’s about: model/entry (article/glace), or a page id with --kind page (required) |
| `--kind <entry\|page>` | entry (default) or page (default `entry`)                                              |
| `--field <string>`     | A field of it (title, body.0)                                                          |
| `--project <string>`   | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`)           |
| `--text <string>`      | The note (required)                                                                    |
| `--reply-to <string>`  | Answer this note (id)                                                                  |

```bash
moteur comments add article/glace "Check the date" --field title
```

### `moteur comments edit <id> <text>`

Change a note’s text

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Note id (required)                                                           |
| `--text <string>`    | The new text (required)                                                      |

Calls `PATCH /projects/{project}/comments/{id}`.

### `moteur comments resolve <id>`

Mark a note done

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Note id (required)                                                           |

Calls `POST /projects/{project}/comments/{id}/resolve`.

### `moteur comments delete <id>`

Delete a note Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Note id (required)                                                           |

Calls `DELETE /projects/{project}/comments/{id}`.

## notifications

### `moteur notifications list`

Your notifications (unread first)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--all`              | Read ones too                                                                |

### `moteur notifications read <id>`

Mark one read

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Notification id (required)                                                   |

Calls `POST /projects/{project}/notifications/{id}/read`.

### `moteur notifications read-all`

Mark them all read

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `POST /projects/{project}/notifications/read-all`.

## activity

### `moteur activity list`

What happened in a project, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--limit <number>`   | How many (max 200)                                                           |
| `--before <string>`  | Older than this time (ISO), for the next page                                |

Calls `GET /projects/{project}/activity`.

### `moteur activity of <kind> <what>`

What happened to one thing: an entry (entry article__glace), a page, a model…

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--kind <string>`    | entry, page, model, asset… (required)                                        |
| `--what <string>`    | Its id (entries: model__entry) (required)                                    |

Calls `GET /projects/{project}/activity/{kind}/{what}`.

### `moteur activity server`

What happened across the server (operators)

| Option              |                                               |
| ------------------- | --------------------------------------------- |
| `--limit <number>`  | How many (max 200)                            |
| `--before <string>` | Older than this time (ISO), for the next page |

Calls `GET /activity`.

## pages

### `moteur pages list`

List the pages

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--template <string>` | Only pages of this template                                                  |
| `--parent <string>`   | Only children of this page                                                   |
| `--status <string>`   | draft, published…                                                            |
| `--type <string>`     | Page type                                                                    |

Calls `GET /projects/{project}/pages`.

### `moteur pages get <id>`

Show one page

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | page id (required)                                                           |

Calls `GET /projects/{project}/pages/{id}`.

### `moteur pages create`

Create a page from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/pages`.

```bash
moteur pages create --file=page.json
```

### `moteur pages update <id>`

Change part of a page (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | page id (required)                                                           |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/pages/{id}`.

### `moteur pages replace <id>`

Replace a page with the JSON given Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | page id (required)                                                           |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PUT /projects/{project}/pages/{id}`.

### `moteur pages delete <id>`

Delete a page Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | page id (required)                                                           |

Calls `DELETE /projects/{project}/pages/{id}`.

### `moteur pages by-slug <slug>`

Find a page by its slug

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | The slug (required)                                                          |
| `--locale <string>`  | In this language (e.g. fr)                                                   |

Calls `GET /projects/{project}/pages/by-slug/{slug}`.

### `moteur pages referrers <id>`

What links to a page: entries and other pages (check before deleting it)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Page id (required)                                                           |

Calls `GET /projects/{project}/pages/{id}/referrers`.

### `moteur pages status <id> <to>`

Set a page’s state (draft, published…)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Page id (required)                                                           |
| `--to <string>`      | The new state (required)                                                     |

Calls `PATCH /projects/{project}/pages/{id}/status`.

### `moteur pages review <id>`

Ask for a review of a page

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Page id (required)                                                           |

Calls `POST /projects/{project}/pages/{id}/submit-review`.

### `moteur pages reorder`

Move pages in the tree (JSON: [{ id, parentId, order }…])

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/pages/reorder`.

### `moteur pages validate <id>`

Check a page for problems

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Page id (required)                                                           |

Calls `POST /projects/{project}/pages/{id}/validate`.

### `moteur pages validate-all`

Check every page

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `POST /projects/{project}/pages/validate-all`.

### `moteur pages history <id>`

The saved versions of a page, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Page id (required)                                                           |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/pages/{id}/revisions`.

### `moteur pages version <id> <revision>`

A page as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Page id (required)                                                           |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/pages/{id}/revisions/{revision}`.

### `moteur pages restore <id> <revision>`

Bring a saved version of a page back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Page id (required)                                                           |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/pages/{id}/revisions/{revision}/restore`.

## site

### `moteur site urls`

Every published address of the site, in every language

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--locale <string>`  | In this language (e.g. fr)                                                   |

Calls `GET /projects/{project}/urls`.

### `moteur site sitemap`

The sitemap, as XML (default) or JSON

| Option                 |                                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`   | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--format <xml\|json>` | Format (default `xml`)                                                       |

### `moteur site navigation`

The page tree as the site navigates it

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--depth <number>`   | How deep                                                                     |
| `--root <string>`    | Start from this page                                                         |
| `--locale <string>`  | In this language (e.g. fr)                                                   |

Calls `GET /projects/{project}/navigation`.

### `moteur site breadcrumb <page>`

The trail to a page (and an entry shown on it)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--page <string>`    | Page id (required)                                                           |
| `--entry <string>`   | Entry id shown on the page                                                   |
| `--locale <string>`  | In this language (e.g. fr)                                                   |

Calls `GET /projects/{project}/breadcrumb`.

### `moteur site resolve <path>`

What lives at an address: a page or entry (and its language), or a redirect

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--path <string>`    | The address, e.g. /fr/a-propos (required)                                    |

Calls `GET /projects/{project}/resolve`.

### `moteur site redirects`

Old addresses and where they go

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/redirects`.

### `moteur site redirect-add <from> <to>`

Send an old address somewhere else

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--from <string>`    | The old path, e.g. /old-about (required)                                     |
| `--to <string>`      | A path on the site, or an http(s) address (required)                         |
| `--status <number>`  | 301 permanent (default), 302 temporary                                       |
| `--note <string>`    | Why it exists                                                                |

Calls `POST /projects/{project}/redirects`.

### `moteur site redirect-update <id>`

Change where a redirect goes

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Redirect id (required)                                                       |
| `--from <string>`    | The old path                                                                 |
| `--to <string>`      | Where it goes                                                                |
| `--status <number>`  | 301 permanent, 302 temporary                                                 |
| `--note <string>`    | Why it exists                                                                |

Calls `PATCH /projects/{project}/redirects/{id}`.

### `moteur site redirect-delete <id>`

Remove a redirect Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Redirect id (required)                                                       |

Calls `DELETE /projects/{project}/redirects/{id}`.

## menus

### `moteur menus list`

List the menus

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/navigations`.

### `moteur menus get <id>`

Show one menu

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | menu id (required)                                                           |

Calls `GET /projects/{project}/navigations/{id}`.

### `moteur menus create`

Create a menu from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/navigations`.

```bash
moteur menus create --file=menu.json
```

### `moteur menus update <id>`

Change part of a menu (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | menu id (required)                                                           |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/navigations/{id}`.

### `moteur menus delete <id>`

Delete a menu Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | menu id (required)                                                           |

Calls `DELETE /projects/{project}/navigations/{id}`.

## media

### `moteur media list`

Files in the library, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--kind <string>`    | image, video, audio, model, document, or unused                              |
| `--folder <string>`  | Only this folder ("" for none)                                               |
| `--search <string>`  | Words in names, titles, alt text                                             |
| `--hash <string>`    | Files with this content hash (duplicates)                                    |
| `--facets`           | Also count files by kind and list folders                                    |
| `--limit <number>`   | How many (1–500) (default `50`)                                              |
| `--offset <number>`  | How many to skip                                                             |

Calls `GET /projects/{project}/assets`.

### `moteur media get <id>`

Show one file

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |

Calls `GET /projects/{project}/assets/{id}`.

### `moteur media upload [files]`

Add files to the library

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--files <list>`     | Paths of the files on this machine                                           |
| `--content <string>` | The file itself, in base64 (or a data: URL), with name                       |
| `--name <string>`    | The file’s name with its extension, for content                              |
| `--url <string>`     | A public HTTPS address of the file: the server downloads it                  |
| `--folder <string>`  | Put them in this folder                                                      |
| `--alt <string>`     | Alt text: what the picture shows                                             |
| `--title <string>`   | Title                                                                        |
| `--caption <string>` | Caption                                                                      |
| `--credit <string>`  | Credit                                                                       |

```bash
moteur media upload photos/*.jpg --folder covers
moteur media upload --url https://example.com/inbox.png --alt "The inbox"
```

### `moteur media update <id>`

Change a file’s alt text, title, caption, credit or focal point

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |
| `--alt <string>`     | Alt text: what the picture shows                                             |
| `--title <string>`   | Title                                                                        |
| `--caption <string>` | Caption                                                                      |
| `--credit <string>`  | Credit                                                                       |
| `--lang <string>`    | The language of --alt, --title and --caption (keeps the others)              |
| `--focal <string>`   | Focal point as x,y between 0 and 1 (0.5,0.4)                                 |

```bash
moteur media update mprq-123 --alt "Under the ice" --lang en
```

### `moteur media move <id> <folder>`

Put a file in a folder ("" for none)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |
| `--folder <string>`  | The folder (required)                                                        |

Calls `POST /projects/{project}/assets/{id}/move`.

### `moteur media replace <id> [file]`

Swap a file for another of the same kind, keeping its id and uses

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |
| `--file <string>`    | Path of the new file on this machine                                         |
| `--content <string>` | The file itself, in base64 (or a data: URL), with name                       |
| `--name <string>`    | The file’s name with its extension, for content                              |

### `moteur media delete <id>`

Put a file in the bin (it can come back)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |

Calls `DELETE /projects/{project}/assets/{id}`.

### `moteur media bin`

Files in the bin

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/assets/bin`.

### `moteur media restore <id>`

Take a file out of the bin

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |

Calls `POST /projects/{project}/assets/{id}/restore`.

### `moteur media purge <id>`

Delete a binned file for good (admins) Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |

Calls `DELETE /projects/{project}/assets/bin/{id}`.

### `moteur media empty-bin`

Delete everything in the bin for good (admins) Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `DELETE /projects/{project}/assets/bin`.

### `moteur media usage [id]`

Where a file is used (or, without an id, how many places use each file)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id                                                                      |

### `moteur media batch`

Change several files at once (JSON: { action: bin|restore|move|update, ids, folder, changes })

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/assets/batch`.

### `moteur media regenerate [ids]`

Remake the sizes of some files (or all)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--ids <list>`       | Files (default: all)                                                         |
| `--background`       | Don’t wait for it                                                            |

Calls `POST /projects/{project}/assets/regenerate`.

### `moteur media video-check <id>`

Ask the video host where a video stands

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |

Calls `POST /projects/{project}/assets/{id}/video/check`.

### `moteur media video-retry <id>`

Send a refused video to its host again

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | File id (required)                                                           |

Calls `POST /projects/{project}/assets/{id}/video/retry`.

## media-settings

### `moteur media-settings get`

Storage, sizes and video hosts

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/media-settings`.

### `moteur media-settings update`

Change media settings (JSON: { assetConfig, videoProviders })

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/media-settings`.

### `moteur media-settings check-storage`

Try storage settings before saving them (JSON: { adapter, adapterConfig })

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/media-settings/check-storage`.

### `moteur media-settings move-storage`

Move every file to another storage and switch to it (JSON: { adapter, adapterConfig }) Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/media-settings/move-storage`.

### `moteur media-settings move-videos`

Move the videos to where new ones go Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--remove-old`       | Remove them from the old host                                                |

Calls `POST /projects/{project}/media-settings/move-videos`.

### `moteur media-settings forget-host <host>`

Forget a video host’s keys Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--host <string>`    | mux, vimeo, cloudflare-stream… (required)                                    |

Calls `DELETE /projects/{project}/media-settings/video-hosts/{host}`.

### `moteur media-settings asset-config`

Image sizes and formats

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/asset-config`.

### `moteur media-settings set-asset-config`

Change image sizes and formats (JSON)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/asset-config`.

## templates

### `moteur templates list`

List the templates

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/templates`.

### `moteur templates get <id>`

Show one template

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | template id (required)                                                       |

Calls `GET /projects/{project}/templates/{id}`.

### `moteur templates create`

Create a template from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/templates`.

```bash
moteur templates create --file=template.json
```

### `moteur templates update <id>`

Change part of a template (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | template id (required)                                                       |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/templates/{id}`.

### `moteur templates replace <id>`

Replace a template with the JSON given Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | template id (required)                                                       |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PUT /projects/{project}/templates/{id}`.

### `moteur templates delete <id>`

Delete a template Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | template id (required)                                                       |

Calls `DELETE /projects/{project}/templates/{id}`.

### `moteur templates validate <id>`

Check a template for problems

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Template id (required)                                                       |

Calls `POST /projects/{project}/templates/{id}/validate`.

### `moteur templates history <id>`

The saved versions of a template, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Template id (required)                                                       |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/templates/{id}/revisions`.

### `moteur templates version <id> <revision>`

A template as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Template id (required)                                                       |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/templates/{id}/revisions/{revision}`.

### `moteur templates restore <id> <revision>`

Bring a saved version of a template back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Template id (required)                                                       |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/templates/{id}/revisions/{revision}/restore`.

## layouts

### `moteur layouts list`

List the layouts

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/layouts`.

### `moteur layouts get <layout>`

Show one layout

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--layout <string>`  | layout id (required)                                                         |

Calls `GET /projects/{project}/layouts/{layout}`.

### `moteur layouts create`

Create a layout from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/layouts`.

```bash
moteur layouts create --file=layout.json
```

### `moteur layouts update <layout>`

Change part of a layout (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--layout <string>`  | layout id (required)                                                         |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/layouts/{layout}`.

### `moteur layouts delete <layout>`

Delete a layout Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--layout <string>`  | layout id (required)                                                         |

Calls `DELETE /projects/{project}/layouts/{layout}`.

### `moteur layouts history <layout>`

The saved versions of a layout, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--layout <string>`  | Layout id (required)                                                         |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/layouts/{layout}/revisions`.

### `moteur layouts version <layout> <revision>`

A layout as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--layout <string>`   | Layout id (required)                                                         |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/layouts/{layout}/revisions/{revision}`.

### `moteur layouts restore <layout> <revision>`

Bring a saved version of a layout back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--layout <string>`   | Layout id (required)                                                         |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/layouts/{layout}/revisions/{revision}/restore`.

## structures

### `moteur structures list`

List the structures

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/structures`.

### `moteur structures get <id>`

Show one structure

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | structure id (required)                                                      |

Calls `GET /projects/{project}/structures/{id}`.

### `moteur structures create`

Create a structure from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/structures`.

```bash
moteur structures create --file=structure.json
```

### `moteur structures update <id>`

Change part of a structure (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | structure id (required)                                                      |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/structures/{id}`.

### `moteur structures delete <id>`

Delete a structure Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | structure id (required)                                                      |

Calls `DELETE /projects/{project}/structures/{id}`.

### `moteur structures history <id>`

The saved versions of a structure, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Structure id (required)                                                      |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/structures/{id}/revisions`.

### `moteur structures version <id> <revision>`

A structure as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Structure id (required)                                                      |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/structures/{id}/revisions/{revision}`.

### `moteur structures restore <id> <revision>`

Bring a saved version of a structure back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Structure id (required)                                                      |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/structures/{id}/revisions/{revision}/restore`.

## blocks

### `moteur blocks list`

List the blocks

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/blocks`.

### `moteur blocks get <slug>`

Show one block

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | block id (required)                                                          |

Calls `GET /projects/{project}/blocks/{slug}`.

### `moteur blocks create`

Create a block from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/blocks`.

```bash
moteur blocks create --file=block.json
```

### `moteur blocks update <slug>`

Change part of a block (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | block id (required)                                                          |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/blocks/{slug}`.

### `moteur blocks replace <slug>`

Replace a block with the JSON given Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | block id (required)                                                          |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PUT /projects/{project}/blocks/{slug}`.

### `moteur blocks delete <slug>`

Delete a block Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | block id (required)                                                          |

Calls `DELETE /projects/{project}/blocks/{slug}`.

### `moteur blocks history <slug>`

The saved versions of a block, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | Block id (required)                                                          |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/blocks/{slug}/revisions`.

### `moteur blocks version <slug> <revision>`

A block as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`     | Block id (required)                                                          |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/blocks/{slug}/revisions/{revision}`.

### `moteur blocks restore <slug> <revision>`

Bring a saved version of a block back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`     | Block id (required)                                                          |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/blocks/{slug}/revisions/{revision}/restore`.

### `moteur blocks core`

The server’s own block types

Calls `GET /moteur/blocks`.

### `moteur blocks register`

Add a block type for the whole server (operators)

| Option            |                                   |
| ----------------- | --------------------------------- |
| `--file <string>` | Read the JSON body from this file |
| `--data <string>` | The JSON body, inline             |

Calls `POST /moteur/blocks`.

## forms

### `moteur forms list`

List the forms

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/forms`.

### `moteur forms get <form>`

Show one form

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | form id (required)                                                           |

Calls `GET /projects/{project}/forms/{form}`.

### `moteur forms create`

Create a form from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/forms`.

```bash
moteur forms create --file=form.json
```

### `moteur forms update <form>`

Change part of a form (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | form id (required)                                                           |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/forms/{form}`.

### `moteur forms delete <form>`

Delete a form Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | form id (required)                                                           |

Calls `DELETE /projects/{project}/forms/{form}`.

### `moteur forms history <form>`

The saved versions of a form, newest first

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | Form id (required)                                                           |
| `--max <number>`     | How many versions                                                            |

Calls `GET /projects/{project}/forms/{form}/revisions`.

### `moteur forms version <form> <revision>`

A form as one saved version had it

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`     | Form id (required)                                                           |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `GET /projects/{project}/forms/{form}/revisions/{revision}`.

### `moteur forms restore <form> <revision>`

Bring a saved version of a form back Asks first (or `--yes`).

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`     | Form id (required)                                                           |
| `--revision <string>` | Revision id (from history) (required)                                        |

Calls `POST /projects/{project}/forms/{form}/revisions/{revision}/restore`.

## submissions

### `moteur submissions list <form>`

What people sent through a form

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | Form id (required)                                                           |
| `--unread`           | Only unread ones                                                             |
| `--status <string>`  | received, spam…                                                              |
| `--limit <number>`   | How many                                                                     |
| `--offset <number>`  | How many to skip                                                             |

Calls `GET /projects/{project}/forms/{form}/submissions`.

### `moteur submissions get <form> <id>`

Show one submission

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | Form id (required)                                                           |
| `--id <string>`      | Submission id (required)                                                     |

Calls `GET /projects/{project}/forms/{form}/submissions/{id}`.

### `moteur submissions mark <form> <id>`

Mark a submission read or unread, spam or not

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | Form id (required)                                                           |
| `--id <string>`      | Submission id (required)                                                     |
| `--read`             | Read (--no-read: unread)                                                     |
| `--spam`             | Spam (--no-spam: not spam)                                                   |

Calls `PATCH /projects/{project}/forms/{form}/submissions/{id}`.

### `moteur submissions delete <form> <id>`

Delete a submission Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`    | Form id (required)                                                           |
| `--id <string>`      | Submission id (required)                                                     |

Calls `DELETE /projects/{project}/forms/{form}/submissions/{id}`.

### `moteur submissions export <form>`

Every submission of a form, as CSV or JSON (or written to a file)

| Option                 |                                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`   | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--form <string>`      | Form id (required)                                                           |
| `--format <csv\|json>` | File format (default `csv`)                                                  |
| `--out <string>`       | Write it to this file instead of printing it                                 |

## field-types

### `moteur field-types list`

Every field type the server knows, with its options

Calls `GET /studio/field-types`.

## members

### `moteur members list`

People in the project, their roles, when they were last here

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/users`.

### `moteur members update <user>`

Change someone’s roles in the project, or turn their access off

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--user <string>`    | Person id (required)                                                         |
| `--roles <list>`     | writer, translator, reviewer, admin, developer, billing                      |
| `--active`           | Access on (--no-active: off)                                                 |
| `--name <string>`    | Name                                                                         |

Calls `PATCH /projects/{project}/users/{user}`.

## invites

### `moteur invites list`

Invites not answered yet

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/invites`.

### `moteur invites send <email>`

Invite someone to the project

| Option                  |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`    | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--email <string>`      | Their email (required)                                                       |
| `--roles <list>`        | Their roles (default writer)                                                 |
| `--studio-url <string>` | The Studio the link opens (default: MOTEUR_STUDIO_URL)                       |

Calls `POST /projects/{project}/invites`.

### `moteur invites resend <id>`

Send an invite again

| Option                  |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`    | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`         | Invite id (required)                                                         |
| `--studio-url <string>` | The Studio the link opens (default: MOTEUR_STUDIO_URL)                       |

Calls `POST /projects/{project}/invites/{id}/resend`.

### `moteur invites withdraw <id>`

Withdraw an invite Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Invite id (required)                                                         |

Calls `DELETE /projects/{project}/invites/{id}`.

### `moteur invites show <token>`

What an invite link is for

| Option             |                                           |
| ------------------ | ----------------------------------------- |
| `--token <string>` | The token from the invite link (required) |

Calls `GET /invites/{token}`.

### `moteur invites accept <token>`

Join a project with an invite (signed in)

| Option             |                                           |
| ------------------ | ----------------------------------------- |
| `--token <string>` | The token from the invite link (required) |

Calls `POST /invites/{token}/accept`.

### `moteur invites register <token>`

Create your account from an invite

| Option                |                                           |
| --------------------- | ----------------------------------------- |
| `--token <string>`    | The token from the invite link (required) |
| `--name <string>`     | Your name (required)                      |
| `--password <string>` | Your password (8+ characters) (required)  |

Calls `POST /invites/{token}/register`.

## keys

### `moteur keys list`

API keys (never their secrets)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/api-keys`.

### `moteur keys create`

Make an API key (its secret is shown once)

| Option                  |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`    | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--label <string>`      | A name for it                                                                |
| `--expires-at <string>` | When it stops working (ISO date)                                             |
| `--channels <list>`     | Channels it may read                                                         |
| `--site-wide`           | May read site-wide data (pages, menus…)                                      |

Calls `POST /projects/{project}/api-keys`.

### `moteur keys update <id>`

Change a key’s name, expiry or what it may read

| Option                  |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`    | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`         | Key id (required)                                                            |
| `--label <string>`      | A name for it                                                                |
| `--expires-at <string>` | When it stops working (ISO date)                                             |
| `--channels <list>`     | Channels it may read                                                         |
| `--site-wide`           | May read site-wide data (pages, menus…)                                      |
| `--hosts <list>`        | Sites allowed to use it                                                      |

Calls `PATCH /projects/{project}/api-keys/{id}`.

### `moteur keys rotate <id>`

Replace a key’s secret (the old one stops working) Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Key id (required)                                                            |

Calls `POST /projects/{project}/api-keys/{id}/rotate`.

### `moteur keys revoke <id>`

Turn a key off for good Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Key id (required)                                                            |

Calls `DELETE /projects/{project}/api-keys/{id}`.

## channels

### `moteur channels list`

List the channels

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/channels`.

### `moteur channels get <id>`

Show one channel

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | channel id (required)                                                        |

Calls `GET /projects/{project}/channels/{id}`.

### `moteur channels create`

Create a channel from its JSON

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `POST /projects/{project}/channels`.

```bash
moteur channels create --file=channel.json
```

### `moteur channels update <id>`

Change part of a channel (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | channel id (required)                                                        |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/channels/{id}`.

### `moteur channels delete <id>`

Delete a channel Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | channel id (required)                                                        |

Calls `DELETE /projects/{project}/channels/{id}`.

### `moteur channels openapi <id>`

The OpenAPI document a frontend reads this channel with

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Channel id (required)                                                        |

Calls `GET /projects/{project}/channels/{id}/openapi`.

### `moteur channels schema <id>`

What this channel delivers, described: models, templates, blocks, structures

Each field's type, label, description and the options that explain its value. A read-only key for the channel can read it.

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Channel id (required)                                                        |

Calls `GET /projects/{project}/channels/{id}/schema`.

```bash
moteur channels schema site --json
```

## webhooks

### `moteur webhooks list`

List the webhooks

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/webhooks`.

### `moteur webhooks get <id>`

Show one webhook

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | webhook id (required)                                                        |

Calls `GET /projects/{project}/webhooks/{id}`.

### `moteur webhooks update <id>`

Change part of a webhook (JSON with the fields to change)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | webhook id (required)                                                        |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

Calls `PATCH /projects/{project}/webhooks/{id}`.

### `moteur webhooks delete <id>`

Delete a webhook Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | webhook id (required)                                                        |

Calls `DELETE /projects/{project}/webhooks/{id}`.

### `moteur webhooks create`

Call an address when content changes: a build hook, or any service

A deploy hook (`--kind deploy`) is a host's build hook (Vercel, Netlify, Cloudflare Pages…): it waits for more changes, then calls once, when what's live changes. Without --events, a deploy hook listens to what goes live; any other hook to every event.

| Option                     |                                                                              |
| -------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`       | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--url <string>`           | The address to call (https)                                                  |
| `--kind <webhook\|deploy>` | deploy: a build hook, called once per round of changes                       |
| `--events <list>`          | Only these events: page.published,entry.published…                           |
| `--name <string>`          | What it is for (default: its address)                                        |
| `--wait <number>`          | A deploy hook: seconds to wait for more changes (default 30)                 |
| `--file <string>`          | Read the JSON body from this file                                            |
| `--data <string>`          | The JSON body, inline                                                        |

Calls `POST /projects/{project}/webhooks`.

```bash
moteur webhooks create --kind deploy --url "$DEPLOY_HOOK"
moteur webhooks create --url https://example.com/hook --events form.submitted
```

### `moteur webhooks test <id>`

Send a test call

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Webhook id (required)                                                        |

Calls `POST /projects/{project}/webhooks/{id}/test`.

### `moteur webhooks log <id>`

Recent deliveries and their answers

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Webhook id (required)                                                        |
| `--limit <number>`   | How many                                                                     |
| `--offset <number>`  | How many to skip                                                             |

Calls `GET /projects/{project}/webhooks/{id}/log`.

### `moteur webhooks retry <id> <delivery>`

Send a failed delivery again

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`       | Webhook id (required)                                                        |
| `--delivery <string>` | Delivery id (from log) (required)                                            |

Calls `POST /projects/{project}/webhooks/{id}/log/{delivery}/retry`.

### `moteur webhooks rotate-secret <id>`

Replace the signing secret Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Webhook id (required)                                                        |

Calls `POST /projects/{project}/webhooks/{id}/rotate-secret`.

## branches

### `moteur branches list`

Content branches, and the current one

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/branches`.

### `moteur branches create <name>`

Start a branch

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--name <string>`    | Branch name (required)                                                       |
| `--from <string>`    | Start from (default: current)                                                |

Calls `POST /projects/{project}/branches`.

### `moteur branches switch <branch>`

Work on another branch

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--branch <string>`  | Branch name (required)                                                       |

Calls `POST /projects/{project}/branches/switch`.

### `moteur branches merge <source>`

Bring a branch into the current one Asks first (or `--yes`).

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--source <string>`  | Branch to merge (required)                                                   |

Calls `POST /projects/{project}/branches/merge`.

### `moteur branches log`

The content’s git history

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--path <string>`    | Only this file or folder                                                     |
| `--max <number>`     | How many                                                                     |

Calls `GET /projects/{project}/git/log`.

### `moteur branches status`

Where the history stands: branch, last commit, and what the Git address lacks

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/git/status`.

### `moteur branches push`

Push the history to the project’s Git address now

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `POST /projects/{project}/git/push`.

## types

### `moteur types`

TypeScript types of the content (models, templates, blocks, structures)

Each type takes a locale mode: 'all' as stored, or 'one' for content read with ?locale=. Make them again after changing a schema; in CI, --check fails when the file is out of date.

| Option               |                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`)          |
| `--out <string>`     | Write them to this file instead of printing them                                      |
| `--channel <string>` | Only what this channel delivers, from its schema (the site's read-only key is enough) |
| `--check`            | Change nothing; fail if the file differs from the project                             |

```bash
moteur types --out src/moteur.ts
MOTEUR_API_KEY=… moteur types --out src/moteur.ts --check
```

## imports

### `moteur imports run [file]`

Import a bundle: schemas, files, pages, entries, menus, redirects (all or nothing)

The bundle comes from a file, or as the JSON body. { "$ref": "page:<ref>" } (or entry:<model>/<ref>, asset:<ref>) anywhere stands for the id of something in the bundle. Try it first with --dry-run.

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`    | The bundle (JSON) on this machine                                            |
| `--dry-run`          | Check everything as if saving, then keep nothing                             |
| `--wait <number>`    | Seconds to wait for the end before answering (0–60)                          |
| `--file <string>`    | Read the JSON body from this file                                            |
| `--data <string>`    | The JSON body, inline                                                        |

```bash
moteur imports run site.json --dry-run
moteur imports run site.json
```

### `moteur imports list`

Recent imports

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/imports`.

### `moteur imports get <id>`

An import and how far it has come

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Import id (required)                                                         |

Calls `GET /projects/{project}/imports/{id}`.

### `moteur imports approve <id>`

Put a waiting import live (a person who can publish)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--id <string>`      | Import id (required)                                                         |

Calls `POST /projects/{project}/imports/{id}/approve`.

## export

### `moteur export`

The project as an import bundle

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--out <string>`     | Write it to this file instead of printing it                                 |

```bash
moteur export --out site.json
```

## ai

### `moteur ai status`

Whether AI is on, and with which provider

Calls `GET /ai/status`.

### `moteur ai settings`

The project’s AI: provider and credits

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /ai/settings/{project}`.

### `moteur ai helpers`

The helpers you may use here, with credits

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /ai/helpers/{project}`.

### `moteur ai write <action>`

Suggest text for a field: draft, rewrite, shorten, expand, change the tone

| Option                                                                                                            |                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`                                                                                              | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--action <draft\|rewrite\|shorten\|expand\|tone:formal\|tone:conversational\|tone:editorial\|summarise-excerpt>` | What to do (required)                                                        |
| `--field <string>`                                                                                                | The field’s key (title, excerpt…) (required)                                 |
| `--field-type <string>`                                                                                           | core/text, core/textarea or core/rich-text (default `core/textarea`)         |
| `--model <string>`                                                                                                | The model, for context                                                       |
| `--entry <string>`                                                                                                | The entry, for context                                                       |
| `--value <string>`                                                                                                | The current text                                                             |
| `--locale <string>`                                                                                               | Its language                                                                 |
| `--context <string>`                                                                                              | The rest of the entry’s text, for context                                    |

```bash
moteur ai write shorten --field excerpt --value "…" --locale fr
```

### `moteur ai translate <value>`

Translate a field’s text from one language to another

| Option                  |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`    | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--value <string>`      | The text (required)                                                          |
| `--from <string>`       | From this language (required)                                                |
| `--to <string>`         | Into this language (required)                                                |
| `--field <string>`      | The field’s key (title, excerpt…)                                            |
| `--field-type <string>` | core/text, core/textarea or core/rich-text (default `core/textarea`)         |
| `--model <string>`      | The model, for context                                                       |
| `--entry <string>`      | The entry, for context                                                       |

### `moteur ai alt <asset>`

Suggest alt text and a caption for a picture

| Option                 |                                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`   | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--asset <string>`     | File id (required)                                                           |
| `--locale <string>`    | In this language                                                             |
| `--other-alt <string>` | Its alt text in another language, as a hint                                  |

Calls `POST /ai/analyse/image`.

### `moteur ai image <prompt>`

Make pictures from a description

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--prompt <string>`  | What to make (required)                                                      |
| `--ratio <string>`   | Shape: 1:1, 16:9…                                                            |
| `--count <number>`   | How many                                                                     |
| `--style <string>`   | Style hints                                                                  |
| `--entry <string>`   | The entry they’re for                                                        |

Calls `POST /ai/generate-image`.

### `moteur ai audio <prompt>`

Make speech from text

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--prompt <string>`  | What to say (required)                                                       |
| `--voice <string>`   | Which voice                                                                  |
| `--entry <string>`   | The entry it’s for                                                           |
| `--field <string>`   | The field it’s for                                                           |

Calls `POST /ai/generate-audio`.

### `moteur ai model3d <prompt>`

Make a 3D model from a description

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--prompt <string>`  | What to make (required)                                                      |
| `--textured`         | With textures                                                                |
| `--format <string>`  | glb, usdz…                                                                   |
| `--entry <string>`   | The entry it’s for                                                           |
| `--field <string>`   | The field it’s for                                                           |

Calls `POST /ai/generate-3d`.

### `moteur ai keep-model <url>`

Keep a generated 3D model in the media library

| Option                 |                                                                              |
| ---------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`   | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--url <string>`       | The model’s address (from model3d) (required)                                |
| `--format <string>`    | glb, usdz…                                                                   |
| `--title <string>`     | Title                                                                        |
| `--prompt <string>`    | What it was made from                                                        |
| `--thumbnail <string>` | Thumbnail address                                                            |

Calls `POST /ai/save-generated-model`.

### `moteur ai fields <prompt>`

Suggest fields for a model (JSON with the current fields, or none)

| Option              |                                   |
| ------------------- | --------------------------------- |
| `--prompt <string>` | What the model is for (required)  |
| `--file <string>`   | Read the JSON body from this file |
| `--data <string>`   | The JSON body, inline             |

### `moteur ai entry <prompt>`

Draft a whole entry for a model (shown, not saved)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--model <string>`   | Model id (required)                                                          |
| `--prompt <string>`  | What it’s about (required)                                                   |
| `--locale <string>`  | In this language                                                             |

Calls `POST /ai/generate/entry`.

### `moteur ai audit`

What AI was asked in the project (prompts for operators)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--limit <number>`   | How many                                                                     |
| `--before <string>`  | Older than (ISO)                                                             |

Calls `GET /projects/{project}/ai-audit`.

### `moteur ai audit-event <event>`

One AI event in full

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--event <string>`   | Event id (required)                                                          |

Calls `GET /projects/{project}/ai-audit/{event}`.

## radar

### `moteur radar report`

Problems found in the content (missing translations, broken links…)

| Option                |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`  | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--scan`              | Scan again instead of the last report                                        |
| `--severity <string>` | Only this severity                                                           |
| `--model <string>`    | Only this model                                                              |
| `--locale <string>`   | Only this language                                                           |
| `--rule <string>`     | Only this rule                                                               |

Calls `GET /projects/{project}/radar`.

### `moteur radar entry <slug>`

Problems in one entry

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--slug <string>`    | model__entry (required)                                                      |

Calls `GET /projects/{project}/radar/entry/{slug}`.

## search

### `moteur search query <q>`

Search entries in the project’s search engine

| Option                            |                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`              | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--q <string>`                    | What to find (required)                                                      |
| `--engine <meilisearch\|algolia>` | Which engine (default `meilisearch`)                                         |
| `--limit <number>`                | How many                                                                     |

Calls `GET /projects/{project}/search/{engine}`.

### `moteur search reindex`

Send every entry to the search engine again (operators)

| Option                            |                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`              | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--engine <meilisearch\|algolia>` | Which engine (default `meilisearch`)                                         |

Calls `POST /projects/{project}/search/{engine}/reindex`.

## shopify

### `moteur shopify status`

The Shopify connection

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /projects/{project}/shopify`.

### `moteur shopify connect`

Set the shop, its token and the product model

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--shop <string>`    | my-shop.myshopify.com                                                        |
| `--token <string>`   | Admin API access token                                                       |
| `--model <string>`   | Model products go into                                                       |

Calls `PATCH /projects/{project}/shopify`.

### `moteur shopify sync`

Pull products from Shopify into entries

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `POST /projects/{project}/shopify/sync`.

## commands

### `moteur commands list`

Commands plugins added on this API

Calls `GET /commands`.

## play

### `moteur play poll <poll>`

A poll’s results

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--poll <string>`    | Poll id (required)                                                           |

Calls `GET /projects/{project}/play/polls/{poll}/results`.

### `moteur play qr <text>`

A QR code as SVG

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--text <string>`    | What it encodes (required)                                                   |
| `--size <number>`    | Size in pixels                                                               |

### `moteur play oembed <url>`

The embed for a link (YouTube, Vimeo…)

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--url <string>`     | The link (required)                                                          |

Calls `GET /projects/{project}/play/oembed/resolve`.

## blueprints

### `moteur blueprints list <kind>`

Blueprints of a kind

| Option                                         |                                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| `--kind <project\|model\|structure\|template>` | project, model, structure or template (required) |

Calls `GET /blueprints/{kind}s`.

### `moteur blueprints get <kind> <id>`

Show a blueprint

| Option                                         |                                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| `--kind <project\|model\|structure\|template>` | project, model, structure or template (required) |
| `--id <string>`                                | Blueprint id (required)                          |

Calls `GET /blueprints/{kind}s/{id}`.

### `moteur blueprints create <kind>`

Create a blueprint (JSON: { id, name, description, template })

| Option                                         |                                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| `--kind <project\|model\|structure\|template>` | project, model, structure or template (required) |
| `--file <string>`                              | Read the JSON body from this file                |
| `--data <string>`                              | The JSON body, inline                            |

Calls `POST /blueprints/{kind}s`.

### `moteur blueprints update <kind> <id>`

Change a blueprint (JSON with the fields to change)

| Option                                         |                                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| `--kind <project\|model\|structure\|template>` | project, model, structure or template (required) |
| `--id <string>`                                | Blueprint id (required)                          |
| `--file <string>`                              | Read the JSON body from this file                |
| `--data <string>`                              | The JSON body, inline                            |

Calls `PATCH /blueprints/{kind}s/{id}`.

### `moteur blueprints delete <kind> <id>`

Delete a blueprint Asks first (or `--yes`).

| Option                                         |                                                  |
| ---------------------------------------------- | ------------------------------------------------ |
| `--kind <project\|model\|structure\|template>` | project, model, structure or template (required) |
| `--id <string>`                                | Blueprint id (required)                          |

Calls `DELETE /blueprints/{kind}s/{id}`.

## billing

### `moteur billing show`

The project’s plan and subscription

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |

Calls `GET /billing/projects/{project}`.

### `moteur billing plans`

Plans the project can be on, with prices

Calls `GET /billing/plans`.

### `moteur billing checkout <plan>`

Move the project to a plan (gives the payment link)

| Option                     |                                                                              |
| -------------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`       | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--plan <string>`          | A plan id from `moteur billing plans` (personal, pro…) (required)            |
| `--interval <month\|year>` | Billed monthly or yearly (default `month`)                                   |
| `--studio-url <string>`    | Where to come back to (default: MOTEUR_STUDIO_URL)                           |

### `moteur billing addons <addon> <packs>`

Set how many packs of an extra the project has

| Option               |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| `--project <string>` | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--addon <string>`   | An extra id from `moteur billing plans` (seats, storage…) (required)         |
| `--packs <number>`   | How many packs (required)                                                    |

Calls `POST /billing/projects/{project}/addons`.

### `moteur billing portal`

A link to the Stripe customer portal

| Option                  |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `--project <string>`    | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--studio-url <string>` | Where to come back to (default: MOTEUR_STUDIO_URL)                           |

Calls `POST /billing/projects/{project}/portal`.

## api

### `moteur api <method> <path>`

Call any API route, signed in (for what has no command yet, and plugins)

| Option                                                                    |                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--method <GET\|POST\|PATCH\|PUT\|DELETE\|get\|post\|patch\|put\|delete>` | GET, POST, PATCH, PUT or DELETE (required)                                   |
| `--path <string>`                                                         | The path; {project} becomes the current project (required)                   |
| `--query <list>`                                                          | key=value for the query string (repeat)                                      |
| `--set <list>`                                                            | key=value for the JSON body (repeat)                                         |
| `--project <string>`                                                      | Project id (default: MOTEUR_PROJECT, .moteur.json, or `moteur projects use`) |
| `--file <string>`                                                         | Read the JSON body from this file                                            |
| `--data <string>`                                                         | The JSON body, inline                                                        |

```bash
moteur api GET /projects/{project}/usage
moteur api POST /projects/{project}/notifications/read-all
```

## doctor

### `moteur doctor`

Check the setup: config, API reachable, signed in, default project

# Imports

An import saves many things at once: a project's structures, blocks, models, templates, files, pages, entries, menus and redirects. It saves **all of it or nothing**: if one thing fails, every file goes back as it was and the files it uploaded are removed. What it saves lands in **one Git commit**, sends **one webhook** (`import.completed`) and is scanned once by Radar.

```bash
moteur imports run site.json --dry-run   # check everything, keep nothing
moteur imports run site.json             # save it
moteur export --out site.json            # a project as a bundle
```

Over HTTP: `POST /projects/:projectId/imports` with the bundle as the body (`?dryRun=1` to check, `?wait=` seconds before answering). MCP clients use the `imports_run` tool with the bundle as `body`.

Imports and exports are for the project's admins, since an export holds every draft. A bundle that brings models, structures, blocks or templates also needs the Builder role (Developer implies it), as changing them by hand does.

## The bundle

```json
{
    "version": 1,
    "existing": "update",
    "publish": false,
    "structures": [{ "type": "cta", "label": "CTA", "fields": { "...": {} } }],
    "blocks": [{ "type": "www-moteur/hero", "label": "Hero", "fields": { "...": {} } }],
    "models": [{ "id": "post", "label": "Post", "fields": { "...": {} } }],
    "templates": [{ "id": "page", "label": "Page", "fields": { "...": {} } }],
    "assets": [
        { "ref": "inbox", "url": "https://example.com/inbox.png", "alt": "The inbox" },
        { "ref": "logo", "content": "iVBORw0KGgo…", "name": "logo.png" }
    ],
    "pages": [
        {
            "id": "home",
            "label": "Home",
            "slug": "",
            "templateId": "page",
            "fields": {
                "blocks": [
                    {
                        "type": "www-moteur/hero",
                        "data": {
                            "shot": { "assetId": { "$ref": "asset:inbox" } },
                            "cta": {
                                "label": { "en": "Pricing" },
                                "link": { "pageId": { "$ref": "page:pricing" } }
                            }
                        }
                    }
                ]
            }
        },
        { "id": "docs", "type": "folder", "label": "Docs", "slug": "docs" },
        { "id": "api", "parent": "docs", "label": "API", "slug": "api", "templateId": "page" }
    ],
    "entries": {
        "post": [
            {
                "id": "hello",
                "data": { "title": "Hello", "author": { "$ref": "entry:author/ada" } }
            }
        ]
    },
    "menus": [{ "handle": "header", "label": "Header", "items": [] }],
    "redirects": [{ "from": "/old", "to": "/new", "status": 301 }]
}
```

- **`$ref`:** `{ "$ref": "page:<ref>" }`, `entry:<model>/<ref>` or `asset:<ref>`, anywhere in fields, data or menus, becomes the id of what it names. A ref is an item's `ref`, or its `id`. Something the project already has can be named by its id. A page's `parent` is a page ref or id. Pages are saved parents first, whatever their order.
- **Ids:** pages and entries keep the `id` they are given, so importing again changes them instead of adding copies. A page without an id gets one.
- **`existing`:** what to do with something already there (same id, type, handle or `from`): `update` it (the default; an entry's data is merged), `skip` it, or `fail` (and keep nothing).
- **Files:** from a public HTTPS address (the server downloads it, refusing private network addresses) or inline in base64 with `name`. A file the library already has is used again, not added twice.
- **Drafts:** pages and entries are saved as drafts. A page that is already live stays live as published, and the import's changes wait in it. With `"publish": true` they then go live in a second step, unless the person or agent needs approval (an agent, or a project whose workflow requires review): the import then waits as `awaiting_approval`, and one person approves it all with `moteur imports approve <id>` (`POST /imports/:id/approve`). An agent can't approve. Menus are live as soon as they're saved, so an agent's menus always wait for that approval, with `publish` or without.

## Jobs

An import is a job. The request waits for it (20 seconds by default, `wait` up to 60), then answers with the job: `200` when done, `422` when nothing was kept (its `issues` say where: `pages[3].fields.hero`, `entries.post[0].data.author`), or `202` while it runs. Follow it with `GET /projects/:projectId/imports/:id` (`moteur imports get <id>`); `progress` says how far it has come. A dry run goes through every item and reports all the problems at once.

While an import runs it holds the project's write lock, so other entry saves wait for it. If the server stops during an import, the next look at the project's imports puts its files back and marks it failed.

The import body can be up to `MOTEUR_IMPORT_BODY_LIMIT` (default `50mb`); each file is limited like an upload (`API_UPLOAD_MAX_MB`). Importing needs the project's Git history, since that is what undoes a failed import.

## Export

`GET /projects/:projectId/export` (`moteur export`) gives the project as a bundle: its own structures and blocks, models, templates, files by address, pages, entries, menus and the redirects people made. Pictures in it are `$ref`s to the files, since their ids change once they are stored again. Imported into an empty project, it makes the same site. File addresses must be reachable from the importing server.

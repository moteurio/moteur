# The import bundle

One JSON document holds what a project needs: schemas, files, pages, entries, menus and redirects. It is saved in one commit, all of it or nothing. [examples/site.json](../examples/site.json) is a complete one, imported cleanly by Moteur's tests.

```bash
moteur imports run site.json --dry-run   # check everything, keep nothing
moteur imports run site.json             # save it
```

Over HTTP: `POST /projects/:projectId/imports` with the bundle as the body (`?dryRun=1` to check). The answer is the job: `200` when done, `422` with `issues` when nothing was kept, `202` while it runs (`GET /projects/:projectId/imports/:id` follows it).

## Top level

| Key                                           | What it holds                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                                     | Always `1`.                                                                                                                                                                                                               |
| `existing`                                    | What to do with something already there (same id): `update` (default, an entry's data is merged), `skip`, or `fail`.                                                                                                      |
| `publish`                                     | `true`: every page and entry goes live once saved. Without it, only those that say `"published": true`. An agent's import, or one into a project that requires review, waits for a person's approval instead (see below). |
| `structures`, `blocks`, `models`, `templates` | Schemas, as their API takes them (see below).                                                                                                                                                                             |
| `assets`                                      | Files for the media library.                                                                                                                                                                                              |
| `pages`                                       | The page tree.                                                                                                                                                                                                            |
| `entries`                                     | Entries by model id: `{ "post": [ … ], "author": [ … ] }`.                                                                                                                                                                |
| `menus`                                       | Menus by handle.                                                                                                                                                                                                          |
| `redirects`                                   | Old addresses to new ones.                                                                                                                                                                                                |

Saved in this order: structures, blocks, models, templates, files, pages (parents first), entries, menus, redirects.

## Refs

`{ "$ref": "page:<ref>" }`, `{ "$ref": "entry:<model>/<ref>" }` or `{ "$ref": "asset:<ref>" }` anywhere in fields, data or menus becomes the id of what it names, whether it is in the bundle or already in the project. An item's ref is its `ref`, or its `id`.

```json
{ "pageId": { "$ref": "page:pricing" } }
{ "assetId": { "$ref": "asset:inbox" } }
{ "author": { "$ref": "entry:author/ada" } }
```

## Schemas

```json
{
    "type": "hero",
    "label": "Hero",
    "fields": {
        "title": { "type": "core/text", "label": "Title", "options": { "required": true } }
    }
}
```

- Blocks and structures: `type` (the project's own, without a slash), `label`, `fields`. A block may add `description`.
- Models: `id`, `label`, `fields`, and `"modelType": "settings"` for one-entry settings.
- Templates: `id`, `label`, `fields`. A page's fields are its template's.
- `label` is one name or one per language. Fields: [fields.md](fields.md).

## Files

```json
{ "ref": "inbox", "url": "https://example.com/inbox.png", "alt": "The inbox" }
{ "ref": "logo", "content": "iVBORw0KGgo…", "name": "logo.png", "folder": "brand" }
```

- `url`: a public HTTPS address the server downloads, or `content`: base64 with its `name`.
- Optional: `folder`, `alt`, `title`, `credit`.
- The same file already in the library is used again, not added twice.
- A dry run checks each file's type and size as an upload would.

## Pages

```json
{ "id": "pricing", "label": "Pricing", "slug": "pricing", "slugs": { "fr": "tarifs" }, "templateId": "page", "published": true, "fields": { … } }
{ "id": "docs", "type": "folder", "label": "Docs", "slug": "docs" }
{ "id": "guide", "parent": "docs", "label": "Guide", "slug": "guide", "templateId": "page", "languages": ["en"] }
{ "id": "blog", "type": "collection", "label": "Blog", "slug": "blog", "templateId": "blog", "modelId": "post", "urlPattern": "[slug]" }
```

| Key                                                 |                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`                                                | Kept, so importing again updates the page. Without, one is made.                                               |
| `type`                                              | `static` (default), `collection` or `folder`.                                                                  |
| `label`, `slug`                                     | Its name in the Studio, and its address segment (`""` for the home page).                                      |
| `slugs`                                             | The segment in other languages: `{ "fr": "tarifs" }`.                                                          |
| `parent`                                            | A page ref or id.                                                                                              |
| `templateId`, `fields`                              | Its template and its values.                                                                                   |
| `languages`                                         | The languages it is in (the default always). Left out: every language.                                         |
| `modelId`, `urlPattern`                             | A collection's model, and its entries' address (`[slug]`, `[year]/[slug]`): fields of the entry, per language. |
| `navInclude`, `navLabel`, `sitemapInclude`, `order` | Menu and sitemap settings.                                                                                     |
| `published`                                         | Goes live once saved (or once approved, see below).                                                            |

## Entries

```json
"entries": {
    "post": [{ "id": "hello", "published": true, "languages": ["en", "fr"], "data": { "title": { "en": "Hello", "fr": "Bonjour" } } }]
}
```

`id` (kept), `data` (the model's fields only), and optionally `ref`, `languages`, `published`.

## Menus

```json
{
    "handle": "main",
    "label": "Main",
    "items": [
        {
            "id": "pricing",
            "label": { "en": "Pricing", "fr": "Tarifs" },
            "linkType": "page",
            "pageId": { "$ref": "page:pricing" }
        },
        {
            "id": "github",
            "label": "GitHub",
            "linkType": "custom",
            "customUrl": "https://github.com/moteurio"
        }
    ]
}
```

An item's `linkType` is `page` (with `pageId`), `custom` (with `customUrl`), `asset` (with `assetId`) or `none`. It may have `children`. A menu is live as soon as it is saved, except an agent's, which waits for the approval with the rest.

## Who may import, and what waits

Importing needs the project's **Admin** role, and **Builder** too (Developer includes it) when the bundle brings structures, blocks, models or templates.

An **agent's** import (an MCP client, an agent token working for review) saves everything as drafts and ends `awaiting_approval`. So does any import into a project whose workflow requires review. A person who can publish then puts it live in one step: `moteur imports approve <id>` (`POST /projects/:projectId/imports/:id/approve`). An agent can't approve. Its menus wait too.

## Redirects

```json
{ "from": "/prices", "to": "/pricing", "status": 301 }
```

## Rich text as HTML

A rich-text field may be given as HTML, converted on import:

```json
"body": { "html": "<h2>Why</h2><p>See <a href=\"/pricing\">our prices</a>.</p>" }
"body": { "html": { "en": "<p>Hello</p>", "fr": "<p>Bonjour</p>" } }
```

It keeps paragraphs, headings, lists, quotes, code, rules, line breaks, marks and links. A link whose address is a page's (in the bundle or the project, in any language) becomes a link to that page. Pictures, tables and embeds are left out, and the job's `notes` say where.

## Moving a project

`moteur export --out site.json` writes a project as a bundle: its own schemas, files, pages, entries, menus and the redirects people made, with what is live marked `"published": true`. `--inline-files` carries the files in it. Imported into another project, it makes the same site.

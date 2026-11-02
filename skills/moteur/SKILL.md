---
name: moteur
description: Work with Moteur, the headless CMS whose projects are Git repositories. Use it to model content (models, templates, blocks, structures, field types), move a site's content in with an import bundle, read content from a channel, build a site on it with @moteurio/astro or @moteurio/client, and drive a project with the moteur CLI. Use whenever a task touches a Moteur project, its API, an import bundle, or a site that reads from Moteur.
---

# Moteur

Moteur keeps a project's content as JSON files in a Git repository: every save is a commit. People edit it in the Studio, and sites read it through the API. This skill is how to work with it without guessing. Exact shapes are in the references, and each one is checked against Moteur by its tests.

- [references/fields.md](references/fields.md): every field type, a definition and a value it accepts, its options.
- [references/bundle.md](references/bundle.md): the import bundle, item by item.
- [references/site.md](references/site.md): reading content, languages, and a site on Astro.
- [examples/site.json](examples/site.json): a complete bundle for a small site in two languages. It imports cleanly.

## The model

- **Project:** a Git repository with its languages (`defaultLocale`, `supportedLocales`), schemas, content, media and settings.
- **Schemas** describe content. Each has `fields` (see references/fields.md):
    - **model** (`id`): the shape of **entries**, a collection like posts, people or products. A model with `"modelType": "settings"` holds one entry (the site's settings).
    - **template** (`id`): the shape of **pages**.
    - **block** (`type`): a section a page or entry stacks in a `core/block-list`.
    - **structure** (`type`): a group of fields used in several places (`core/structure`), like a call to action.
- **Pages** form a tree:
    - `static`: one page, drawn by its template.
    - `collection`: a page whose entries have their own addresses (`urlPattern: "[slug]"` gives `/blog/hello`).
    - `folder`: an address segment with no page of its own.
- **Media library:** files, referred to by `assetId` (`core/asset`).
- **Channels:** what a site may read. Every new project has a `site` channel (pages, every model, menus, forms, layouts). A read-only API key opens it.
- **Drafts and live:** content is saved as a draft and goes live when published. Sites read what is live.

## Names

- A name with a slash is the server's (`core/hero`, `core/seo`, a plugin's `geo/map`). A name without one is the project's own (`hero`, `cta`). Never give a project's block or structure a slash.
- Models and templates are named by `id`, blocks and structures by `type`: the name content points with.
- Use lowercase letters, digits and dashes for ids (`site-settings`). Letters, digits, `_` and `-` are accepted.

## The way to work

1. **Look first.** `moteur projects describe` gives the project's languages, how content goes live, your roles and every model's fields. `moteur field-types list` gives the field types this server has, with their options (plugins add some).
2. **Model the content** before writing any: which models (collections), which templates (kinds of page), which blocks (sections) and structures (repeated groups). Prefer a typed field over `core/json`.
3. **Write one bundle** with the schemas, files, pages, entries, menus and redirects (references/bundle.md). Point between items with refs: `{ "$ref": "page:pricing" }`.
4. **Dry run it:** `moteur imports run site.json --dry-run`. It checks everything as if saving (files included) and keeps nothing. Fix every issue it names: each has its place in the bundle (`pages[3].fields.blocks[2].data.kicker`). Read its `notes` too (what HTML lost, links it made).
5. **Import it:** `moteur imports run site.json`. One commit, all or nothing. Pages and entries with `"published": true` go live (or all of them with `"publish": true`). An agent's import waits instead: it ends `awaiting_approval`, and a person who can publish puts it live with `moteur imports approve <id>`. So does any import into a project whose workflow requires review. Importing needs the project's Admin role, and the Builder role (Developer includes it) when the bundle brings schemas.
6. **Generate the types** for the site: `moteur types --channel site --out src/moteur.ts`.
7. **Build the site** on the channel (references/site.md), and check it (`astro check` with @moteurio/astro).

To start a project from the CLI: `moteur auth login`, then `moteur projects create my-site --label "My site" --language en --languages fr`, then `moteur projects use my-site`. For the site's key: `moteur keys create --label "Site build" --channels site --site-wide`. Its secret is shown once.

## Rules that are easy to get wrong

- **Options go in `options`**, never beside `type`, except a list's item field (`items`) and an object's fields (`fields`). An option a type doesn't have is refused, with the one meant when it is close.
- **`required` goes in `options`:** `{ "type": "core/text", "label": "Title", "options": { "required": true } }`.
- **Empty is fine** for a field that isn't required (`""`, `[]`, `{}`, or left out). `allowEmpty` only matters for a required field.
- **One value per language** for a field with `multilingual: true`: `{ "en": "Pricing", "fr": "Tarifs" }`. Labels and names may be one per language everywhere too.
- **Only the schema's fields.** A value for a field a block, template or model doesn't have is refused by an import (a warning when saved otherwise). Rename the field in the schema, or drop the value.
- **Links to pages** keep following the page, in every language:
    - a link field: `{ "pageId": "pricing", "label": "See prices" }`
    - Markdown: `[See prices](page:pricing)`
    - rich text: a link with `"meta": [{ "id": "pageId", "value": "pricing" }]`
    - in an import, HTML links to a page's address (`/pricing`) become page links on their own.
- **Rich text from HTML:** give a rich-text field `{ "html": "<p>…</p>" }` in a bundle. It is converted. Pictures, tables and embeds are left out, and the job's `notes` say where.
- **Languages a page is in:** every language of the project unless it says `"languages": ["en"]`. A page not in French has no French address. Don't publish copies as translations.
- **Language folders** keep the project's spelling of the locale: `/zh-Hans/about`.
- **Settings models** hold one entry. Read it at `GET /projects/:id/channels/site/settings/:modelId`.
- **Plans** on a host may limit a project's people, storage, requests, form submissions, and how many models, templates, blocks, structures, forms, channels, entries and pages it has (**402** `plan_limit`, with `limit` and `max`). A dry run says when a bundle needs more.

## Reading and changing a project

- The CLI covers the API: `moteur <group> --help` lists commands, and every command takes `--json`. `moteur api GET /projects/my-site/pages` reaches anything else.
- Export a project as a bundle with `moteur export --out site.json`. Add `--inline-files` to carry its files when the other server can't reach this one.
- The Studio shows a field's `description` as help: write one for anything a writer could hesitate over.
- Sites never see drafts. A preview link shows a draft to a person.

## When something is refused

Moteur's errors name the place and the rule: read the message before changing anything. An import's `issues` each give a `path` in the bundle and a `message`. When saving a schema or content refuses it, its `issues` carry their level (`type`): errors refuse, warnings only inform. The full documentation is at https://github.com/moteurio/moteur/tree/main/docs (Imports.md, Fields.md, Pages and navigation.md, Public API and Channels.md, Frontend.md, CLI.md).

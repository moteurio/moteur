# Pages and navigation

Models describe content independently of its URL. Pages describe a site's tree and bind content to templates. Navigations are named menus whose links are resolved when an application reads them.

## Page types

| Type         | Purpose                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `static`     | One authored page with a `templateId`, `fields` and publication status                  |
| `collection` | A model binding that produces a URL per entry, with a template and optional URL pattern |
| `folder`     | Structural grouping in the tree, without authored page content                          |

Pages use `parentId`, `slug` and `order` to define their position. Static and collection pages have `draft` or `published` status. Page statuses differ from entry statuses: entries also support review and explicit unpublication.

Manage the tree through `/projects/:projectId/pages` with a member JWT. Page templates live under `/projects/:projectId/templates`. A collection page's `modelId` selects its entries; `urlPattern` overrides the model's default pattern. Patterns can use entry fields, for example `[slug]`. Review the [Page types](../packages/types/src/Page.ts) and the host's OpenAPI document for required fields and supported operations.

`navInclude`, `navLabel`, `sitemapInclude` and sitemap options control derived site outputs. These are different from manually authored named menus. A folder groups descendants; it is not a standalone content page.

## Addresses in every language

A page's `slug` is its address in the project's default language. `slugs` gives it in the others, for example `{ "fr": "a-propos" }`; a language left out uses `slug`. Each slug must be URL-safe and unique among its siblings in its language. A translator may change `slugs` as part of a translation.

Collection URL patterns read translated entry fields in each language, so `[slug]` on an entry whose slug is `{ "en": "the-factory", "fr": "l-usine" }` gives `/blog/the-factory` and `/fr/blogue/l-usine`.

The project's `localePrefix` sets how an address shows its language:

| `localePrefix`     | Default language | Other languages          |
| ------------------ | ---------------- | ------------------------ |
| `others` (default) | `/about`         | `/fr/a-propos`           |
| `all`              | `/en/about`      | `/fr/a-propos`           |
| `none`             | `/about`         | `/a-propos` (slugs only) |

With `none`, a page whose slug is the same in two languages has one address, listed once.

Every page and entry then has one address per language. `/urls` and `sitemap.json` list each with its `locale` and its `alternates` (the same page in every language), and take `?locale=` to keep one language. `sitemap.xml` lists every address with `hreflang` alternates and an `x-default`. `navigation`, `breadcrumb`, a page by slug, and an entry's `resolveUrl` take `?locale=` too.

`GET /projects/:projectId/resolve?path=/fr/a-propos` says what lives at a path, for a site's catch-all route: `{ match: "page", locale, nodeId, entryId?, alternates… }`, or `{ match: "redirect", to, status }`, or 404.

## Links to pages

A `core/link` field can point at a page (`pageId`) instead of a URL, and a `core/relation` or `core/relations` field can point at pages (`target: "pages"`). Delivery gives each the page's current address, in every language, so a page that moves takes its links with it. See [Fields](Fields.md#core-link).

`GET /projects/:projectId/pages/:id/referrers` lists what points at a page: each entry or page, the field (`hero.cta`, `body[2].data.link`) and whether it is a link or a relation. Studio shows it before a page is deleted. A deleted page's links stay, marked `missing: true` on delivery, and Radar reports them (`broken-page-link`, or `page-link-to-draft` for a page that isn't published) until they are changed. Page problems have `modelSlug: "pages"`.

## Redirects

`/projects/:projectId/redirects` lists old addresses and where they go (`from`, `to`, `status` 301 or 302, optional `note`). They are kept in `redirects.json`, in Git with the pages. A site or its host reads the list with a project key and applies it, or asks `resolve` path by path.

Moteur adds a redirect itself (`auto: true`, 301) when a live address changes: a published page's slug in any language, its parent, or a published entry's pattern fields. A page's entries follow it. Drafts have no live address, so they make none.

The list stays short and safe:

- A redirect to another redirect points to the end of the chain, and redirects to an address follow it when it moves again.
- A loop, a second redirect from one address, or a redirect from a live page's address is refused. Change the page's address instead.
- When an address is live again, the redirect from it goes.

`from` is a path starting with `/` (no query or `#`); trailing slashes are ignored. `to` is a path, or a full `http(s)` address. Anyone who can write content manages them (`POST`, `PATCH /:id`, `DELETE /:id`); reading them counts as a public request.

## Named menus

Manage menus through `/projects/:projectId/navigations`. Each navigation has a project-unique `handle`, such as `header`, a nesting limit, and ordered items. Items link to a page, a custom URL, an asset, or no destination for a grouping item. Labels can be plain text or locale-keyed strings. A page link is resolved at read time, so the menu does not need a copied URL for every page.

A collection must explicitly grant the menu handle, or `menus` for all menus, before a key can read it. Delivery endpoints are:

```text
GET /projects/:projectId/collections/:collectionId/menus
GET /projects/:projectId/collections/:collectionId/menus/:handle
```

Pass `locale` when selecting localized labels. Collection permissions and API-key restrictions still apply. See [Public API and Collections](Public%20API%20and%20Collections.md).

## Site outputs and previews

The engine also exposes project sitemap XML/JSON, derived navigation, URL and breadcrumb outputs. Project keys restricted to channels may be denied these site-wide routes unless `allowSiteWideReads` is enabled. Prefer a channel when an application should see only a subset of the site.

Authoring routes return the current editable data. Public delivery depends on publication and collection configuration; a successful draft save does not make it live. Keep preview requests on a trusted server using member credentials rather than exposing a user JWT in browser code. See [REST API](REST%20API.md), [Workflows](Workflows.md) and [Scheduling](Scheduling.md).

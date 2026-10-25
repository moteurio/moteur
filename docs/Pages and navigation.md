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

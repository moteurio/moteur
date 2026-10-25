# Content modeling

Start with a project: it owns membership, languages, schemas and content. A model describes repeatable content; an entry is one instance. Pages and navigation give that content a place in a site, while a collection controls how an application can read it.

## Choose a schema

| Concept       | Use it for                                     | Instance data                                             |
| ------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Model         | Repeated records such as articles or products  | Entries with `type`, `data`, status and audit metadata    |
| Structure     | A reusable group of fields                     | Nested field values using that structure                  |
| Block schema  | A typed section such as a hero or text section | Block instances within layouts or block-list fields       |
| Layout        | An ordered composition of blocks               | The layout's block instances                              |
| Page template | Fields for a kind of page                      | A page's `fields`                                         |
| Blueprint     | A starting point for a project or schema       | A copied starting configuration, not a live shared schema |

Field definitions are keyed by field ID. For example, create a model with an authenticated `POST /projects/:projectId/models`:

```json
{
    "id": "articles",
    "label": "Articles",
    "fields": {
        "title": {
            "type": "core/text",
            "label": "Title",
            "options": { "required": true, "multilingual": false }
        },
        "slug": { "type": "core/text", "label": "Slug", "options": { "multilingual": false } }
    }
}
```

Then create an entry with `POST /projects/:projectId/models/articles/entries`:

```json
{
    "id": "first-article",
    "type": "articles",
    "status": "draft",
    "data": { "title": "First article", "slug": "first-article" }
}
```

See [Fields](Fields.md) for field options and value shapes, [Blocks](Blocks.md) for sections, and [Blueprints](Blueprints.md) for reusable starting points. Membership is required for the authoring API; schema changes also depend on project roles. See [Authentication](Authentication.md).

## Languages and references

The project's `defaultLocale` and `supportedLocales` define its languages. A multilingual field uses a locale-keyed value such as `{ "en": "Hello", "fr": "Bonjour" }`; a non-multilingual text field uses a plain string. Set the field's multilingual option deliberately and preserve the expected value shape when importing content. Translator access allows language changes subject to the engine's default-language restrictions.

Use reference fields to relate entries instead of copying the same content into several records. Public collection configuration controls which fields are returned and how deeply references are expanded. See [Public API and Collections](Public%20API%20and%20Collections.md).

## Saving, validating and publishing

PATCH merges `data` by field: omitted fields keep their values, supplied fields replace their entire value, and `null` clears a field. A localized object sent for one field replaces that object's existing languages; send the languages you intend to retain. IDs and audit metadata are managed by the server.

Drafts can be incomplete. Moving to review or publication checks required content. Published entries can have newer unpublished edits: delivery keeps serving the publish-time version. An unavailable required snapshot is hidden rather than replaced with a newer draft. See [Workflows](Workflows.md) and [Git](Git.md).

For conditional edits, GET the authoring entry and retain the response's `version`; send it quoted in `If-Match` on PATCH. A stale version returns 412. A change made while the API validates your patch returns 409. Reload and resolve the conflict before retrying. The HTTP client supports `entries.update(projectId, modelId, entryId, patch, { version })`.

Changing a schema does not automatically migrate every existing entry. Validate affected content and plan its update before publishing the new shape. [Schema revisions](Schema%20revisions.md) explains history and restore; [Entry queries](Entry%20queries.md) covers lists, filters and missing translations.

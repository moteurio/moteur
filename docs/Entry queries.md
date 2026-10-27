# Entry queries

Authenticated entry lists read the latest authoring version. Public channels read the version allowed by that channel's delivery configuration. They share basic paging and sorting, but the richer search/filter/group features described here belong to authoring lists.

## List and page

```http
GET /projects/my-project/models/articles/entries?limit=25&offset=0&sort=-updatedAt
Authorization: Bearer <member-token>
```

The response contains `entries` and `total`. The default HTTP page size is 100; send an explicit `limit` for predictable pagination. The maximum requested page size is 1,000. `offset` is a non-negative integer. Sort by `id`, `createdAt`, `updatedAt` or `publishedAt`; prefix a field with `-` for descending order. `status=draft,in_review` limits authoring statuses.

Data-field sorting uses `sort=data.title` and optional `sortLocale=fr`. Text sorts ignore case and accents, use the first nonempty language when the chosen language is unavailable, and place empty values last. The ID breaks ties; offset pagination still moves when records are edited between requests.

## Search and filters

| Query parameter                         | Meaning                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `q=hello`                               | Search IDs and indexed short text, ignoring case and accents      |
| `filter.category=news,events`           | Match any listed value for a field                                |
| `filter.$workflow=edits`                | Published entries with newer unpublished edits                    |
| `filter.$editor=user-id`                | Last editor; `$creator` also exists                               |
| `missing=title:fr,en`                   | Entries missing at least one requested language for the field     |
| `fields=title,slug`                     | Project the returned `data` fields                                |
| `group=category&groupOrder=news,events` | Group order before the requested sort                             |
| `facets=category,$workflow`             | Per-value counts, each ignoring its own filter                    |
| `missingCounts=title:fr,en`             | Counts of missing languages, ignoring the missing-language filter |
| `limit=0`                               | Counts only, without entry items                                  |

Different filter keys must all match; values within one key are alternatives. These are list filters, not arbitrary query expressions or a full-text search language. Percent-encode query strings; the client builds them for you:

```ts
const result = await client.entries.list(projectId, 'articles', {
    limit: 25,
    sort: '-updatedAt',
    filters: { $workflow: ['edits'] },
    missing: { field: 'title', locales: ['fr'] },
    fields: ['title', 'slug']
});
```

See [`@moteurio/client`](../packages/client/README.md) for setup and typed parameters.

## Index and delivery boundaries

The default SQLite index is a rebuildable copy of entry files. `MOTEUR_CONTENT_INDEX=files` selects scans instead. Both adapters implement authoring list semantics; SQLite avoids rereading every entry on each warm query. External edits are discovered by reconciliation, so prefer API writes when immediate index visibility matters. See [Operations](Operations.md).

Search, facets, grouping and missing-translation features do not operate on the published snapshot view. Use the public channel's documented parameters for frontend delivery, and configure exposed resources, fields and reference depth in that channel. A project key is not a substitute for a member token on authoring lists. See [Public API and Channels](Public%20API%20and%20Channels.md).

Public delivery also enforces a shared reference/byte work budget and can return 422 `READ_BUDGET_EXCEEDED`. See [Operations](Operations.md#resource-budgets).

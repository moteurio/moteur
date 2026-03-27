# Webhooks

Webhooks notify your HTTPS endpoint when content events occur in a project (entry published, asset deleted, review approved, form submitted, etc.). You register a URL and optional filters; Moteur POSTs a signed JSON payload for each matching event. Delivery is asynchronous with retries.

**Endpoints:** [REST API — Webhooks (outbound)](REST%20API.md#-webhooks-outbound). In-process registration via `Moteur.webhooks` in `@moteurio/core`: [Embedded core API](Developer%20API.md).

---

## When to use webhooks

- **Trigger builds** — e.g. when an entry is published, call your SSG or CI to rebuild.
- **Sync to other systems** — push content changes to a search index, cache, or external API.
- **Notify** — e.g. post to Slack when a review is approved or a form is submitted.
- **Audit** — log events to your own system.

---

## Event types

| Event                   | Description                    |
| ----------------------- | ------------------------------ |
| `entry.created`         | Entry created.                 |
| `entry.updated`         | Entry updated.                 |
| `entry.published`       | Entry status set to published. |
| `entry.unpublished`     | Entry unpublished.             |
| `entry.deleted`         | Entry deleted.                 |
| `entry.scheduled`       | Publish/unpublish scheduled.   |
| `entry.unscheduled`     | Schedule cancelled.            |
| `entry.schedule.failed` | Scheduled action failed.       |
| `asset.created`         | Asset created.                 |
| `asset.updated`         | Asset updated.                 |
| `asset.deleted`         | Asset deleted.                 |
| `page.published`        | Page published.                |
| `page.unpublished`      | Page unpublished.              |
| `page.deleted`          | Page deleted.                  |
| `page.scheduled`        | Page schedule set.             |
| `page.unscheduled`      | Page schedule cancelled.       |
| `page.schedule.failed`  | Page schedule failed.          |
| `review.submitted`      | Entry submitted for review.    |
| `review.approved`       | Review approved.               |
| `review.rejected`       | Review rejected.               |
| `comment.created`       | Comment created on an entry.   |
| `form.submitted`        | Form submission received.      |

When registering a webhook you can pass an **events** array; if empty, the webhook receives **all** events. You can further narrow with **filters** (e.g. only when `modelId === 'article'`).

---

## Payload

Every delivery is a `POST` with `Content-Type: application/json`. The body is a single JSON object:

```json
{
    "id": "<delivery-uuid>",
    "event": "entry.published",
    "timestamp": "2025-03-09T12:00:00.000Z",
    "projectId": "my-project",
    "environment": "production",
    "source": "studio",
    "data": {
        "entryId": "...",
        "modelId": "article",
        "status": "published",
        "updatedBy": "user-id",
        "slug": "my-post"
    }
}
```

| Field         | Description                                       |
| ------------- | ------------------------------------------------- |
| `id`          | Unique delivery ID (same as `X-Moteur-Delivery`). |
| `event`       | Event type.                                       |
| `timestamp`   | ISO 8601 UTC.                                     |
| `projectId`   | Project id.                                       |
| `environment` | Optional (e.g. production, staging).              |
| `source`      | `studio`, `api`, or `scheduler`.                  |
| `data`        | Event-specific payload (see below).               |
| `test`        | If `true`, this is a test ping (no real event).   |

### Data shapes by event

- **Entry events:** `{ entryId, modelId, status, locale?, slug?, updatedBy }`
- **Asset events:** `{ assetId, filename, mimeType, updatedBy }`
- **Page events:** `{ pageId, title, url, updatedBy }`
- **Review events:** `{ reviewId, entryId, modelId, status, reviewedBy? }`
- **Comment:** `{ commentId, entryId, modelId, authorId }`
- **Form:** `{ formId, formHandle, submissionId, fields }`
- **Schedule events:** `{ scheduleId, entryId?, pageId?, modelId?, action, scheduledAt?, error? }`

---

## Headers and signature

Each request includes:

| Header               | Description                                    |
| -------------------- | ---------------------------------------------- |
| `Content-Type`       | `application/json`                             |
| `X-Moteur-Event`     | Event name.                                    |
| `X-Moteur-Delivery`  | Delivery id.                                   |
| `X-Moteur-Signature` | `sha256=<HMAC-SHA256(secret, rawBody)>` (hex). |
| `X-Moteur-Timestamp` | Unix timestamp (seconds).                      |

Plus any **custom headers** you configured on the webhook.

### Verifying the signature

1. Read the **raw request body** as a string (before parsing JSON).
2. Get your webhook **secret** (the one you set when creating the webhook).
3. Compute `HMAC-SHA256(secret, rawBody)` and encode as **hex**.
4. Compare with the value after `sha256=` in `X-Moteur-Signature` using a **timing-safe** comparison.

Example (Node.js):

```js
const crypto = require('crypto');

function verifySignature(secret, rawBody, signatureHeader) {
    const expected =
        'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```

If verification fails, respond with **400** and do not process the payload.

---

## Filters

When creating or updating a webhook you can set **filters** so it only receives events that match. Filters are ANDed. Supported fields: `modelId`, `status`, `locale`, `environment`, `source`. Operators: `eq`, `ne`, `in`, `nin`. Example: only `entry.published` when `modelId` is `article`:

```json
{ "field": "modelId", "operator": "eq", "value": "article" }
```

---

## Retries

Failed deliveries (non-2xx or timeout) are retried at: **30 s**, **5 min**, **30 min**, **2 hr**. After 5 attempts, the delivery is marked failed. You can **retry** a failed delivery from the API or Studio (Project → Webhooks → delivery log).

---

## Registering a webhook

- **REST API:** `POST {basePath}/projects/:projectId/webhooks` with JWT. Body: `{ name, url, secret?, events?, filters?, headers?, enabled? }`. URL must be HTTPS (or HTTP localhost in development). Secret is optional (one is generated if omitted); it is returned only in the create response.
- **`@moteurio/client`:** use the admin client’s project-scoped webhooks methods (see [client README](../packages/client/README.md)).
- **Embedded `@moteurio/core`:** `Moteur.webhooks.create(projectId, user, { … })` and related methods—see [Embedded core API](Developer%20API.md).
- **Studio:** Project → Webhooks → add endpoint, set URL, events, and optional filters.

Other operations: list, get, update, delete, **rotate secret**, **test** (sends a test ping), **delivery log**, **retry** a failed delivery. See [REST API](REST%20API.md#-webhooks-outbound).

---

## Security

- Store the webhook **secret** securely; use it only for signature verification.
- Prefer **HTTPS**; HTTP is allowed only for localhost in development.
- Secrets can be stored encrypted at rest when `MOTEUR_ENCRYPTION_KEY` is set.

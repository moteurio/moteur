# Review & Approval Workflows

This document describes Moteur’s **Review & Approval Workflow**: how to enable it, how it works, the different modes, and how it fits with the Activity Log and Comments.

---

## Overview

The workflow lets projects require that **entries are reviewed before being published**. Authors submit entries for review; users with the **reviewer** (or **operator**) role approve or reject. Approval can auto-publish the entry; rejection returns it to draft and attaches the rejection reason as a **Comment** on the entry.

- **Backend and API only** — no built-in studio UI; your frontend uses the REST API and/or [`@moteurio/client`](../packages/client/README.md).
- **Optional per project** — enable via `project.workflow` in `project.json`.
- **Integrates with** Activity Log (all actions logged), Comments (rejection reason), and Notifications (in-studio + optional email).

---

## Entry statuses

Every entry has a `status` field. It is stored on the entry JSON and defaults to `draft` when omitted.

| Status        | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `draft`       | Editable, not yet submitted or returned after rejection.                         |
| `in_review`   | Submitted for review; waiting for approve/reject.                                |
| `published`   | Live; visible to public/headless API when the project exposes published content. |
| `unpublished` | Previously published, then taken down (e.g. via status change).                  |

Status is set by:

- **Creating/updating an entry** — you can set `status` in the payload (subject to the publish guard below).
- **Submitting for review** — sets status to `in_review`.
- **Approving a review** — in `auto_publish` mode, sets status to `published`.
- **Rejecting a review** — sets status back to `draft`.
- **PATCH entry status** — operators can set any status; other users are restricted when `requireReview` is enabled.

---

## Enabling the workflow

In the project’s `project.json`, add an optional `workflow` object:

```json
{
    "id": "my-project",
    "label": "My Project",
    "defaultLocale": "en",
    "workflow": {
        "enabled": true,
        "mode": "auto_publish",
        "requireReview": true
    }
}
```

| Field           | Type    | Default | Description                                                                                                                                                         |
| --------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`       | boolean | `false` | When `true`, the review workflow is active for this project.                                                                                                        |
| `mode`          | string  | —       | Currently only `auto_publish` (approve → entry becomes `published`).                                                                                                |
| `requireReview` | boolean | —       | When `true`, users **without** the operator role cannot set an entry to `published` unless it has an **approved** review. Operators can always set status directly. |

If `workflow` is missing or `workflow.enabled` is `false`, the project behaves as before: no submit/approve/reject, and no publish guard.

---

## Workflow modes

### `auto_publish` (current)

- Author (or any project member) **submits** an entry for review → entry status becomes `in_review`, a **Review** record is created with status `pending`.
- A user with **reviewer** or **operator** role **approves** the review → the Review is resolved as `approved`, and the entry status is set to **`published`**.
- A reviewer or operator **rejects** the review → the Review is resolved as `rejected`, a **Comment** is created on the entry with the rejection reason, and the entry status is set back to **`draft`**. The Comment ID is stored on the Review as `rejectionCommentId`.

Other modes (e.g. manual publish after approval) may be added later; the API is designed so new modes can be supported without breaking existing behaviour.

---

## Roles and who can do what

| Role         | Stored as    | Implies               | What they can do                                                                                         |
| ------------ | ------------ | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `writer`     | `writer`     | —                     | Create and edit entries and pages. Submit for review. Publish only when review allows it.                |
| `translator` | `translator` | —                     | Edit other languages (including inside blocks) and translated file text. Submit for review. Not publish. |
| `reviewer`   | `reviewer`   | writer                | Approve and reject, which publishes in `auto_publish`.                                                   |
| `billing`    | `billing`    | —                     | Project payment, when that screen exists. Does not edit content.                                         |
| `admin`      | `admin`      | writer                | Setup, people, and publishing without a review. Not the raw tools.                                       |
| `developer`  | `developer`  | admin (and so writer) | Everything an admin can do, plus JSON, API channels, API keys and webhooks.                              |

Account roles live in `users.json`. A project's `memberRoles[userId]`, when present, replaces those roles for that project. An empty role list still counts as `writer`. Developer implies admin without storing both roles. See [Authentication](Authentication.md#roles-in-a-project).

- **Submit for review**: a writer, reviewer, admin, developer, or translator.
- **Approve / Reject**: `reviewer`, `admin`, or `developer`.
- **Publish without approval**: when `workflow.requireReview` is `true`, only an **admin** or **developer** can set an entry to `published` without an approved review. Other users get a 403 if they try (e.g. via PATCH entry or PATCH status).
- **Translator saves**: the API rejects changes to the default locale, plain fields, status (other than submitting for review), and file credit, folder, or focal point.

To grant reviewer rights, add `"reviewer"` to the user’s `roles` in `data/users.json`:

```json
{
    "id": "jane",
    "name": "Jane",
    "email": "jane@example.com",
    "roles": ["reviewer"],
    "projects": ["my-project"],
    "isActive": true
}
```

---

## The flow step by step

1. **Author edits an entry** (status can be `draft` or anything else).
2. **Author (or someone) submits for review**
    - API: `POST .../entries/:id/submit-review` (optional body: `{ "assignedTo": "userId" }`).
    - Entry status → `in_review`.
    - A new **Review** is created with `status: 'pending'`.
    - Activity: `submitted_for_review`.
    - Notifications: reviewers (or `assignedTo`) get “review requested”; optional email if configured.
3. **Reviewer opens the entry/review** and either:
    - **Approves**
        - API: `POST .../reviews/:reviewId/approve`.
        - Entry status → `published` (in `auto_publish` mode).
        - Review → `approved`, `resolvedAt` set.
        - Activity: `approved`.
        - Requester gets a notification (and optional email).
    - **Rejects**
        - API: `POST .../reviews/:reviewId/reject` with body `{ "reason": "..." }`.
        - A **Comment** is created on the entry with that reason; its ID is stored in `Review.rejectionCommentId`.
        - Entry status → `draft`.
        - Review → `rejected`, `resolvedAt` set.
        - Activity: `rejected`.
        - Requester gets a notification (and optional email).
4. **If rejected**, the author can fix the entry and **submit for review again** (step 2). Only one **pending** review per entry at a time.

---

## Publish guard

When **`workflow.enabled`** and **`workflow.requireReview`** are both `true`:

- Any attempt to set an entry’s status to **`published`** (via PATCH entry or PATCH status) is allowed only if:
    - the user is an **operator**, or
    - the entry has **at least one approved Review**.
- Otherwise the API returns **403** with a message that publishing requires an approved review.

When `workflow.enabled` is `false` or `requireReview` is `false`, there is no guard: existing behaviour (direct status updates) is unchanged.

---

## Notifications

### In-studio notifications

- Stored per project in **`notifications.json`**.
- **When an entry is submitted for review**: all users with the **reviewer** role (or the optional `assignedTo` user) receive a `review_requested` notification.
- **When a review is approved or rejected**: the user who submitted (`requestedBy`) receives an `approved` or `rejected` notification.

API: `GET .../notifications`, `POST .../notifications/:id/read`, `POST .../notifications/read-all`. See [REST API](REST%20API.md) and [`@moteurio/client`](../packages/client/README.md).

### Email (optional)

- Configured via environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- If **nodemailer** is installed and SMTP is configured, the same events (review requested, approved, rejected) trigger plain-text emails to the relevant users.
- Email is **non-blocking** and **fail-safe**: send failures are caught and optionally logged to the Activity Log; they never fail the request.

---

## Activity Log and Comments

- **Activity Log**: Every workflow action is logged (`submitted_for_review`, `approved`, `rejected`) with the usual fields (resourceType `entry`, resourceId `modelId__entryId`, userId, timestamp, etc.). See [REST API – Activity Log](REST%20API.md).
- **Comments**: Rejection uses the existing Comments system. The rejection reason is stored as a Comment on the entry (`resourceType: 'entry'`, `resourceId: modelId__entryId`). The Review stores that Comment’s ID in `rejectionCommentId` so the studio can link “rejected” to the thread.

---

## Real-time (WebSocket)

When the optional presence plugin is installed, the workflow event bridge emits to the **project room**:

- `review:submitted` — payload: full Review.
- `review:approved` — payload: full Review.
- `review:rejected` — payload: full Review (includes `rejectionCommentId`).
- `review:status_changed` — payload: `{ entryId, modelId, status }`.

The Socket.IO contract belongs to `plugin-presence` in `moteur-plugins-extra`. These live updates are optional; REST review operations work without that plugin.

---

## API quick reference

| Action            | REST                                                  |
| ----------------- | ----------------------------------------------------- |
| Submit for review | `POST .../entries/:id/submit-review`                  |
| List reviews      | `GET .../reviews?modelId=&entryId=&status=`           |
| Get one review    | `GET .../reviews/:reviewId`                           |
| Approve           | `POST .../reviews/:reviewId/approve`                  |
| Reject            | `POST .../reviews/:reviewId/reject` body `{ reason }` |
| Set entry status  | `PATCH .../entries/:id/status` body `{ status }`      |

All REST endpoints require JWT and project access. Approve/reject require **reviewer** or **operator** role (403 otherwise).  
Full details: [REST API](REST%20API.md). In-process equivalents exist on `Moteur.reviews` in `@moteurio/core`—see [Embedded core API](Developer%20API.md).

---

## Revision Pointer System (git-native)

Every save increments the entry's `audit.revision` counter and commits `entry.json` to git. There is **one file per entry** — git is the version store.

Publishing captures the git commit hash as `publishedCommit`. When the public API needs to serve a published entry that has since been edited, it uses `git show <publishedCommit>:path/to/entry.json` to retrieve the frozen published content directly from git.

### Audit fields

| Field               | Type   | Meaning                                                                     |
| ------------------- | ------ | --------------------------------------------------------------------------- |
| `revision`          | number | Current save counter (increments on every save).                            |
| `publishedRevision` | number | Revision number at the time of last publish. `undefined` = never published. |
| `publishedCommit`   | string | Git commit hash of the published version. Used by the public API.           |
| `publishedAt`       | string | ISO date of last publish.                                                   |

### How it works

1. **Save (no publish)**: `entry.json` updated, `revision` bumped, committed to git. `publishedRevision` and `publishedCommit` stay unchanged.
2. **Save + Publish (auto-merge)**: save first, then publish. The publish action sets `status: published`, commits, captures the commit hash, and stores it as `publishedCommit`.
3. **Publish only** (`POST .../entries/:id/publish`): sets `publishedRevision = revision`, commits `entry.json`, captures the commit hash as `publishedCommit`.

When `revision > publishedRevision`, the entry has **unpublished changes**. The studio shows an "N unpublished changes" badge.

### Public API behaviour

The public API reads `entry.json` and checks `publishedCommit` and `publishedRevision`:

- If the entry has no newer revision than its published revision, the current entry file is the public version.
- If `revision > publishedRevision`, delivery uses the publish-time snapshot from the content index/cache or Git. If the required pointer or snapshot is unavailable, the entry is hidden instead of exposing newer edits.

### Revision history

`GET .../entries/:id/revisions` returns the git log for the entry file (newest first). Each commit that touched the entry file is one revision. Query parameter `?max=N` (default 20, max 100).

### In-memory cache

The public API does **not** call `git show` on every request. An in-memory LRU cache (keyed by `${commitHash}:${path}`) eliminates git overhead:

- **Write-through on publish**: when `publishEntry()` runs, the published content is cached immediately. The first public read after a publish hits the cache — zero git calls.
- **Read-through on cold start**: after a server restart, the first request per entry with unpublished changes triggers one `git show`, parses and caches the result. All subsequent reads are instant.
- **Never stale**: git commit hashes are immutable. A cache entry for `abc123:models/blog/entries/my-post/entry.json` is valid forever.
- **Bounded memory**: LRU eviction at 500 entries (configurable). Only entries with `revision > publishedRevision` need caching — the majority serve `entry.json` directly with no cache lookup at all.

The cache can be cleared at any time (`publishedCache.clear()`) with no data loss — git is always the source of truth, and the cache rebuilds lazily on the next request.

### Why git-native?

- **No duplicate files**: one `entry.json` per entry. Git stores every version.
- **Diff**: `git diff <publishedCommit> HEAD -- path/to/entry.json` shows what changed since publish.
- **Rollback**: restore any past version with `git show <hash>:path`.
- **Preview**: view the entry at any commit.
- **Clean history**: each save is one commit.

### API quick reference (additions)

| Action           | REST                                   | Description                                                                  |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Publish entry    | `POST .../entries/:id/publish`         | Publish current revision; captures git commit hash. Subject to review guard. |
| Revision history | `GET .../entries/:id/revisions?max=20` | Git log for the entry (newest first).                                        |

---

## Related guides

| Topic         | Summary                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Enable**    | Set `workflow.enabled: true` (and optionally `requireReview: true`) in `project.json`.                                                 |
| **Mode**      | Only `auto_publish`: approve → entry becomes `published`.                                                                              |
| **Roles**     | `reviewer` or operator slug (in `users.json`) to approve/reject; only operators bypass the publish guard when `requireReview` is true. |
| **Statuses**  | `draft` → `in_review` (submit) → `published` (approve) or back to `draft` (reject).                                                    |
| **Rejection** | Stored as a Comment on the entry; `Review.rejectionCommentId` links to it.                                                             |
| **Guard**     | When `requireReview` is true, users without the operator role need an approved review to set `published`.                              |
| **Revisions** | Git-native. `revision` bumps on every save; `publishedCommit` points to the live git commit.                                           |

For timed publication, see [Scheduling](Scheduling.md). For safe concurrent edits and list queries, see [Content modeling](Content%20modeling.md) and [Entry queries](Entry%20queries.md).

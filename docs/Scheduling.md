# Scheduling publication

Schedules publish or unpublish one entry or page at a future instant. They are workspace records under the project, separate from Git workspace/user-data snapshot scheduling.

## Create and manage

Use a member JWT to create an entry schedule:

```http
POST /projects/my-project/schedules
Authorization: Bearer <member-token>
Content-Type: application/json

{
    "resourceType": "entry",
    "resourceId": "first-article",
    "modelId": "articles",
    "action": "publish",
    "scheduledAt": "2030-06-01T13:00:00Z"
}
```

For a page, use `resourceType: "page"`, the page ID as `resourceId`, and omit `modelId`. Actions are `publish` and `unpublish`. Send a future timestamp with a timezone; the engine normalizes it to UTC. Scheduling does not freeze an independent release snapshot: consider the content that will exist at execution time.

| Operation                                               | Route under `/projects/:projectId`   |
| ------------------------------------------------------- | ------------------------------------ |
| List, optionally filtered by resource, action or status | `GET /schedules`                     |
| Read one                                                | `GET /schedules/:scheduleId`         |
| Create                                                  | `POST /schedules`                    |
| Cancel a pending schedule                               | `POST /schedules/:scheduleId/cancel` |
| Delete a terminal schedule                              | `DELETE /schedules/:scheduleId`      |

Only one pending schedule for a resource and action is allowed. Cancel it before replacing it. Pending or processing records cannot be deleted as if they were completed history.

## Permissions and outcomes

Project permissions and the review workflow apply when scheduling. A required approval must be present before scheduling publication; a review-only agent cannot use scheduling to skip approval. A schedule can still fail at execution, for example if its resource was removed or its content no longer validates. Inspect its status and error rather than treating creation as a guarantee of publication.

Statuses are `pending`, `processing`, `done`, `failed` and `cancelled`. Failure handling records activity, emits schedule events and can notify reviewers. See [Workflows](Workflows.md) for reviews and [REST API](REST%20API.md) for response schemas.

## Running the scheduler

The scheduler uses timers and periodic sweeps inside the API process. Keep a single writer running continuously if publication time matters; a host scaled to zero cannot execute a timer until it wakes again. Sweeps recover interrupted processing records, with at-least-once status assignment after a crash. This is not a distributed job queue or an atomic release of several documents.

Persist the workspace store and review failed schedules after a restart or restore. [Operations](Operations.md) covers storage and deployment; [Git](Git.md) covers the separate snapshot scheduler.

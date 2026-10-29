import { createHash, randomUUID } from 'crypto';
import { assertEntryComplete } from './validators/entryComplete.js';
import type { Review, GetReviewsOptions } from '@moteurio/types/Review.js';
import { canReview } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';
import { assertCanSubmit } from './contentAccess.js';
import { getProject } from './projects.js';
import { addComment } from './comments.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { REVIEWS_KEY, entryKey, pageKey } from './utils/storageKeys.js';
import { getModelSchema } from './models.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { PageNode } from '@moteurio/types/Page.js';
import { log, toActivityEvent } from './activityLogger.js';
import { triggerEvent } from './utils/eventBus.js';
import { createNotification } from './notifications.js';
import { sendReviewEmail } from './emailNotifier.js';
import { getProjectUsers, getUserById } from './users.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { publishEntry } from './entries.js';
import { withProjectWriteLock } from './utils/projectWriteLock.js';
import { pinPublishedPage } from './pages/publishedPages.js';
import { assertPageReady, publishReviewedPage } from './pages.js';

/**
 * What a review is about, as a fingerprint: an entry's data, or a page's content and settings
 * (not its place in the tree or its state). Approving needs it unchanged since it was sent.
 */
export function contentVersion(resource: Entry | PageNode): string {
    const content =
        'data' in resource
            ? ((resource as Entry).data ?? {})
            : (() => {
                  const {
                      status: _s,
                      updatedAt: _u,
                      order: _o,
                      parentId: _p,
                      publishedCommit: _c,
                      publishedAt: _a,
                      ...rest
                  } = resource as PageNode & {
                      status?: string;
                      publishedCommit?: string;
                      publishedAt?: string;
                  };
                  return rest;
              })();
    return createHash('sha256').update(stableJson(content)).digest('hex').slice(0, 32);
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object')
        return `{${Object.keys(value as object)
            .sort()
            .filter(k => (value as Record<string, unknown>)[k] !== undefined)
            .map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
            .join(',')}}`;
    return JSON.stringify(value);
}

function changedSinceSubmitted(): Error {
    return Object.assign(
        new Error('This changed after it was sent for review. Open it again before approving.'),
        { statusCode: 409, code: 'REVIEW_STALE' }
    );
}

/** Publishing used the approvals waiting for this entry or page: each publishes once. */
export async function useApprovals(
    projectId: string,
    target: { modelId: string; entryId: string } | { pageId: string }
): Promise<void> {
    const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];
    const now = new Date().toISOString();
    let changed = false;
    for (const r of list) {
        if (r.status !== 'approved' || r.usedAt) continue;
        const match =
            'pageId' in target
                ? r.resourceType === 'page' && r.pageId === target.pageId
                : r.resourceType !== 'page' &&
                  r.modelId === target.modelId &&
                  r.entryId === target.entryId;
        if (match) {
            r.usedAt = now;
            changed = true;
        }
    }
    if (changed) await putProjectJson(projectId, REVIEWS_KEY, list);
}

function normalizeUserName(user: User): string {
    return user?.name ?? user?.id ?? 'Unknown';
}

function assertReviewerOrAdmin(user: User): void {
    if (!canReview(user)) {
        const err = new Error(
            user.agent?.reviewOnly
                ? 'An agent can’t approve or reject reviews: a person does.'
                : 'Only users with reviewer or admin role can perform this action'
        );
        (err as Error & { statusCode: number }).statusCode = 403;
        throw err;
    }
}

/**
 * Submit an entry for review. Sets entry status to 'in_review' and creates a Review record.
 */
export async function submitForReview(
    projectId: string,
    user: User,
    modelId: string,
    entryId: string,
    assignedTo?: string
): Promise<Review> {
    const project = await getProject(user, projectId);
    assertCanSubmit(user);
    if (!project.workflow?.enabled) {
        throw new Error('Review workflow is not enabled for this project');
    }

    const schema = await getModelSchema(user, projectId, modelId);
    const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
    if (!entry) {
        throw new Error(
            `Entry "${entryId}" not found in model "${modelId}" of project "${projectId}".`
        );
    }
    assertEntryComplete(entry, schema, 'review');
    const now = new Date().toISOString();

    try {
        const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];

        const pendingForEntry = list.some(
            r => r.modelId === modelId && r.entryId === entryId && r.status === 'pending'
        );
        if (pendingForEntry) {
            throw new Error('This entry already has a pending review');
        }

        const requestedByName = normalizeUserName(user);
        const review: Review = {
            id: randomUUID(),
            projectId,
            modelId,
            entryId,
            status: 'pending',
            requestedBy: user.id,
            requestedByName,
            ...(assignedTo && { assignedTo }),
            createdAt: now,
            submittedVersion: contentVersion(entry)
        };
        list.push(review);
        await putProjectJson(projectId, REVIEWS_KEY, list);

        const entryUpdated: Entry = { ...entry, status: 'in_review' };
        await putProjectJson(projectId, entryKey(modelId, entryId), entryUpdated);

        triggerEvent('content.saved', {
            projectId,
            paths: [REVIEWS_KEY, entryKey(modelId, entryId)],
            message: `Submit for review ${modelId}/${entryId} — ${normalizeUserName(user)}`,
            user
        });

        log(
            toActivityEvent(
                projectId,
                'entry',
                `${modelId}__${entryId}`,
                'submitted_for_review',
                user
            )
        );

        try {
            await triggerEvent('review.submitted', { projectId, review });
        } catch {
            // never break on emit failure
        }
        try {
            await webhookDispatch(
                'review.submitted',
                {
                    reviewId: review.id,
                    entryId,
                    modelId,
                    status: review.status
                },
                { projectId, source: 'api' }
            );
        } catch {
            // never fail the operation
        }
        try {
            await triggerEvent('review.entryStatusChanged', {
                projectId,
                entryId,
                modelId,
                status: 'in_review'
            });
        } catch {
            // never break on emit failure
        }

        const recipients: string[] = assignedTo
            ? [assignedTo]
            : getProjectUsers(projectId, project)
                  .filter(u => canReview(u))
                  .map(u => u.id);
        for (const recipientId of recipients) {
            try {
                await createNotification(projectId, recipientId, {
                    type: 'review_requested',
                    reviewId: review.id,
                    entryId,
                    modelId
                });
            } catch {
                // swallow per-recipient failure
            }
        }

        try {
            for (const recipientId of recipients) {
                const recipient = getProjectUsers(projectId).find(u => u.id === recipientId);
                if (recipient?.email) {
                    sendReviewEmail('review_requested', recipient, review, project).catch(() => {});
                }
            }
        } catch {
            // non-blocking, fail silently
        }

        return review;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to submit for review', { cause: err });
    }
}

/**
 * Approve a review. Reviewers, content leads and admins (canReview). Sets entry to published (auto_publish mode).
 */
export async function approveReview(
    projectId: string,
    user: User,
    reviewId: string
): Promise<Review> {
    // Checked and published with no save in between: what goes live is what was approved.
    return withProjectWriteLock(projectId, () => approveReviewUnlocked(projectId, user, reviewId));
}

async function approveReviewUnlocked(
    projectId: string,
    user: User,
    reviewId: string
): Promise<Review> {
    assertReviewerOrAdmin(user);
    const project = await getProject(user, projectId);
    if (!project.workflow?.enabled) {
        throw new Error('Review workflow is not enabled for this project');
    }

    try {
        const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];
        const idx = list.findIndex(r => r.id === reviewId && r.projectId === projectId);
        if (idx === -1) throw new Error('Review not found');
        const review = list[idx]!;
        if (review.status !== 'pending') {
            throw new Error('Review is not pending');
        }
        // The reviewer approves what was sent: an edit since then needs a fresh look.
        const sent =
            review.resourceType === 'page' && review.pageId
                ? await getProjectJson<PageNode>(projectId, pageKey(review.pageId))
                : review.modelId && review.entryId
                  ? await getProjectJson<Entry>(projectId, entryKey(review.modelId, review.entryId))
                  : null;
        if (sent && contentVersion(sent) !== review.submittedVersion) throw changedSinceSubmitted();
        // A page goes live on approval: it must be complete first.
        if (review.resourceType === 'page' && sent)
            await assertPageReady(projectId, sent as PageNode);

        const now = new Date().toISOString();
        const reviewedByName = normalizeUserName(user);
        const updated: Review = {
            ...review,
            status: 'approved',
            reviewedBy: user.id,
            reviewedByName,
            resolvedAt: now
        };
        list[idx] = updated;
        await putProjectJson(projectId, REVIEWS_KEY, list);

        if (review.resourceType === 'page' && review.templateId && review.pageId) {
            const page = await getProjectJson<PageNode>(projectId, pageKey(review.pageId));
            const recordSave = () =>
                triggerEvent('content.saved', {
                    projectId,
                    paths: [REVIEWS_KEY, pageKey(review.pageId!)],
                    message: `Approve review (page) — ${normalizeUserName(user)}`,
                    user
                });
            if (page) {
                // Approving publishes what was reviewed: it becomes the page's public version.
                await publishReviewedPage(projectId, user, page, recordSave);
                await useApprovals(projectId, { pageId: review.pageId });
            } else void recordSave();
            log(toActivityEvent(projectId, 'page', review.pageId, 'approved', user));
            try {
                await triggerEvent('review.approved', { projectId, review: updated });
            } catch {
                // never break on emit failure
            }
            try {
                await webhookDispatch(
                    'review.approved',
                    {
                        reviewId: updated.id,
                        entryId: review.entryId ?? '',
                        modelId: review.modelId ?? '',
                        status: updated.status,
                        reviewedBy: user.id
                    },
                    { projectId, source: 'api' }
                );
            } catch {
                // never fail the operation
            }
            try {
                await triggerEvent('review.pageStatusChanged', {
                    projectId,
                    pageId: review.pageId,
                    templateId: review.templateId,
                    status: 'published'
                });
            } catch {
                // never break on emit failure
            }
            try {
                await createNotification(projectId, review.requestedBy, {
                    type: 'approved',
                    reviewId: updated.id,
                    pageId: review.pageId,
                    templateId: review.templateId
                });
            } catch {
                // swallow
            }
        } else if (review.modelId && review.entryId) {
            // Publish for real (commit + publishedCommit pointer), not just flip the status:
            // otherwise the public API keeps serving the previous publish-time snapshot. The
            // review is already saved as approved, which satisfies publishEntry's review check.
            const exists = await getProjectJson<Entry>(
                projectId,
                entryKey(review.modelId, review.entryId)
            );
            if (exists) {
                await publishEntry(user, projectId, review.modelId, review.entryId);
            }
            log(
                toActivityEvent(
                    projectId,
                    'entry',
                    `${review.modelId}__${review.entryId}`,
                    'approved',
                    user
                )
            );
            try {
                await triggerEvent('review.approved', { projectId, review: updated });
            } catch {
                // never break on emit failure
            }
            try {
                await webhookDispatch(
                    'review.approved',
                    {
                        reviewId: updated.id,
                        entryId: review.entryId,
                        modelId: review.modelId ?? '',
                        status: updated.status,
                        reviewedBy: user.id
                    },
                    { projectId, source: 'api' }
                );
            } catch {
                // never fail the operation
            }
            try {
                await triggerEvent('review.entryStatusChanged', {
                    projectId,
                    entryId: review.entryId,
                    modelId: review.modelId,
                    status: 'published'
                });
            } catch {
                // never break on emit failure
            }
            try {
                await createNotification(projectId, review.requestedBy, {
                    type: 'approved',
                    reviewId: updated.id,
                    entryId: review.entryId,
                    modelId: review.modelId
                });
            } catch {
                // swallow
            }
        }

        try {
            const requestedByUser = getUserById(review.requestedBy);
            if (requestedByUser?.email) {
                sendReviewEmail('approved', requestedByUser, updated, project).catch(() => {});
            }
        } catch {
            // non-blocking
        }

        return updated;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to approve review', { cause: err });
    }
}

/**
 * Reject a review. Reviewers, content leads and admins (canReview). Creates a Comment with the reason, sets entry back to draft.
 */
export async function rejectReview(
    projectId: string,
    user: User,
    reviewId: string,
    commentBody: string
): Promise<Review> {
    assertReviewerOrAdmin(user);
    const project = await getProject(user, projectId);
    if (!project.workflow?.enabled) {
        throw new Error('Review workflow is not enabled for this project');
    }

    try {
        const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];
        const idx = list.findIndex(r => r.id === reviewId && r.projectId === projectId);
        if (idx === -1) throw new Error('Review not found');
        const review = list[idx]!;
        if (review.status !== 'pending') {
            throw new Error('Review is not pending');
        }

        const resourceId =
            review.resourceType === 'page' && review.pageId
                ? review.pageId
                : `${review.modelId}__${review.entryId}`;
        const resourceType = review.resourceType === 'page' ? 'page' : 'entry';
        const comment = await addComment(projectId, user, {
            resourceType,
            resourceId,
            body: commentBody.trim() || 'Rejected without comment.'
        });

        const now = new Date().toISOString();
        const reviewedByName = normalizeUserName(user);
        const updated: Review = {
            ...review,
            status: 'rejected',
            reviewedBy: user.id,
            reviewedByName,
            rejectionCommentId: comment.id,
            resolvedAt: now
        };
        list[idx] = updated;
        await putProjectJson(projectId, REVIEWS_KEY, list);

        if (review.resourceType === 'page' && review.pageId) {
            const page = await getProjectJson<PageNode>(projectId, pageKey(review.pageId));
            if (page) {
                // A live page stays live with its published version. The refused changes stay in
                // the page, for its writer to rework: they are not live, and go live only when
                // someone publishes the page again.
                const live = !!(page as { publishedCommit?: string }).publishedCommit;
                await putProjectJson(projectId, pageKey(review.pageId), {
                    ...page,
                    status: live ? 'published' : 'draft'
                });
            }
            triggerEvent('content.saved', {
                projectId,
                paths: [REVIEWS_KEY, pageKey(review.pageId)],
                message: `Reject review (page) — ${normalizeUserName(user)}`,
                user
            });
            log(toActivityEvent(projectId, 'page', review.pageId, 'rejected', user));
            try {
                await triggerEvent('review.rejected', { projectId, review: updated });
            } catch {
                // never break on emit failure
            }
            try {
                await webhookDispatch(
                    'review.rejected',
                    {
                        reviewId: updated.id,
                        entryId: review.entryId ?? '',
                        modelId: review.modelId ?? '',
                        status: updated.status,
                        reviewedBy: user.id
                    },
                    { projectId, source: 'api' }
                );
            } catch {
                // never fail the operation
            }
            try {
                await triggerEvent('review.pageStatusChanged', {
                    projectId,
                    pageId: review.pageId,
                    templateId: review.templateId ?? '',
                    status: 'draft'
                });
            } catch {
                // never break on emit failure
            }
            try {
                await createNotification(projectId, review.requestedBy, {
                    type: 'rejected',
                    reviewId: updated.id,
                    pageId: review.pageId,
                    templateId: review.templateId
                });
            } catch {
                // swallow
            }
        } else if (review.modelId && review.entryId) {
            const entry = await getProjectJson<Entry>(
                projectId,
                entryKey(review.modelId, review.entryId)
            );
            if (entry) {
                await putProjectJson(projectId, entryKey(review.modelId, review.entryId), {
                    ...entry,
                    status: 'draft'
                });
            }
            triggerEvent('content.saved', {
                projectId,
                paths: [REVIEWS_KEY, entryKey(review.modelId, review.entryId)],
                message: `Reject review (entry) — ${normalizeUserName(user)}`,
                user
            });
            log(toActivityEvent(projectId, 'entry', resourceId, 'rejected', user));
            try {
                await triggerEvent('review.rejected', { projectId, review: updated });
            } catch {
                // never break on emit failure
            }
            try {
                await webhookDispatch(
                    'review.rejected',
                    {
                        reviewId: updated.id,
                        entryId: review.entryId,
                        modelId: review.modelId ?? '',
                        status: updated.status,
                        reviewedBy: user.id
                    },
                    { projectId, source: 'api' }
                );
            } catch {
                // never fail the operation
            }
            try {
                await triggerEvent('review.entryStatusChanged', {
                    projectId,
                    entryId: review.entryId,
                    modelId: review.modelId,
                    status: 'draft'
                });
            } catch {
                // never break on emit failure
            }
            try {
                await createNotification(projectId, review.requestedBy, {
                    type: 'rejected',
                    reviewId: updated.id,
                    entryId: review.entryId,
                    modelId: review.modelId
                });
            } catch {
                // swallow
            }
        }

        try {
            const requestedByUser = getUserById(review.requestedBy);
            if (requestedByUser?.email) {
                sendReviewEmail('rejected', requestedByUser, updated, project).catch(() => {});
            }
        } catch {
            // non-blocking
        }

        return updated;
    } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error('Failed to reject review', { cause: err });
    }
}

export async function getReviews(
    projectId: string,
    options?: GetReviewsOptions
): Promise<Review[]> {
    try {
        const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];
        let out = list.filter(r => r.projectId === projectId);
        if (options?.modelId) out = out.filter(r => r.modelId === options.modelId);
        if (options?.entryId) out = out.filter(r => r.entryId === options.entryId);
        if (options?.templateId) out = out.filter(r => r.templateId === options.templateId);
        if (options?.pageId) out = out.filter(r => r.pageId === options.pageId);
        if (options?.resourceType) out = out.filter(r => r.resourceType === options.resourceType);
        if (options?.status) out = out.filter(r => r.status === options.status);
        out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return out;
    } catch {
        return [];
    }
}

export async function getReview(projectId: string, reviewId: string): Promise<Review | null> {
    try {
        const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];
        const review = list.find(r => r.id === reviewId && r.projectId === projectId);
        return review ?? null;
    } catch {
        return null;
    }
}

/**
 * Returns true if the entry has at least one approved review (used by publish guard).
 */
export async function hasApprovedReview(
    projectId: string,
    modelId: string,
    entryId: string
): Promise<boolean> {
    const reviews = await getReviews(projectId, { modelId, entryId, status: 'approved' });
    return reviews.some(r => !r.usedAt);
}

/**
 * Returns true if the page has at least one approved review (used by publish guard).
 */
export async function hasApprovedReviewForPage(
    projectId: string,
    pageId: string
): Promise<boolean> {
    const reviews = await getReviews(projectId, {
        pageId,
        resourceType: 'page',
        status: 'approved'
    });
    return reviews.some(r => !r.usedAt);
}

/**
 * Submit a page for review. Sets page status to 'in_review' and creates a Review record.
 */
export async function submitForPageReview(
    projectId: string,
    user: User,
    pageId: string,
    assignedTo?: string
): Promise<Review> {
    const project = await getProject(user, projectId);
    assertCanSubmit(user);
    if (!project.workflow?.enabled) {
        throw new Error('Review workflow is not enabled for this project');
    }

    const found = await getProjectJson<PageNode>(projectId, pageKey(pageId));
    if (!found) {
        throw new Error(`Page "${pageId}" not found in project "${projectId}".`);
    }
    if (found.type === 'folder') {
        throw new Error('Folder pages cannot be submitted for review.');
    }

    const now = new Date().toISOString();
    const list = (await getProjectJson<Review[]>(projectId, REVIEWS_KEY)) ?? [];

    const pendingForPage = list.some(
        r => r.resourceType === 'page' && r.pageId === pageId && r.status === 'pending'
    );
    if (pendingForPage) {
        throw new Error('This page already has a pending review');
    }

    // A live page stays live while in review: its published version is pinned first.
    const page = (await pinPublishedPage(projectId, user, found)) as typeof found;

    const requestedByName = normalizeUserName(user);
    const review: Review = {
        id: randomUUID(),
        projectId,
        resourceType: 'page',
        templateId: page.templateId,
        pageId,
        status: 'pending',
        requestedBy: user.id,
        requestedByName,
        ...(assignedTo && { assignedTo }),
        createdAt: now,
        submittedVersion: contentVersion(page)
    };
    list.push(review);
    await putProjectJson(projectId, REVIEWS_KEY, list);

    // A live page stays live while its changes are reviewed: sites keep its published version.
    await putProjectJson(projectId, pageKey(pageId), { ...page, status: 'in_review' });

    triggerEvent('content.saved', {
        projectId,
        paths: [REVIEWS_KEY, pageKey(pageId)],
        message: `Submit page for review — ${normalizeUserName(user)}`,
        user
    });

    log(toActivityEvent(projectId, 'page', pageId, 'submitted_for_review', user));

    try {
        await triggerEvent('review.submitted', { projectId, review });
    } catch {
        // never break on emit failure
    }
    try {
        await triggerEvent('review.pageStatusChanged', {
            projectId,
            pageId,
            templateId: page.templateId,
            status: 'in_review'
        });
    } catch {
        // never break on emit failure
    }

    const recipients: string[] = assignedTo
        ? [assignedTo]
        : getProjectUsers(projectId, project)
              .filter(u => canReview(u))
              .map(u => u.id);
    for (const recipientId of recipients) {
        try {
            await createNotification(projectId, recipientId, {
                type: 'review_requested',
                reviewId: review.id,
                pageId,
                templateId: page.templateId
            });
        } catch {
            // swallow per-recipient failure
        }
    }

    try {
        for (const recipientId of recipients) {
            const recipient = getProjectUsers(projectId).find(u => u.id === recipientId);
            if (recipient?.email) {
                sendReviewEmail('review_requested', recipient, review, project).catch(() => {});
            }
        }
    } catch {
        // non-blocking, fail silently
    }

    return review;
}

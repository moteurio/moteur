import { randomUUID } from 'crypto';
import type { Review, GetReviewsOptions } from '@moteurio/types/Review.js';
import type { User } from '@moteurio/types/User.js';
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

function normalizeUserName(user: User): string {
    return user?.name ?? user?.id ?? 'Unknown';
}

function assertReviewerOrAdmin(user: User): void {
    const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
    const isReviewer = Array.isArray(user.roles) && user.roles.includes('reviewer');
    if (!isAdmin && !isReviewer) {
        throw new Error('Only users with reviewer or admin role can perform this action');
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
    if (!project.workflow?.enabled) {
        throw new Error('Review workflow is not enabled for this project');
    }

    await getModelSchema(user, projectId, modelId);
    const entry = await getProjectJson<Entry>(projectId, entryKey(modelId, entryId));
    if (!entry) {
        throw new Error(
            `Entry "${entryId}" not found in model "${modelId}" of project "${projectId}".`
        );
    }
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
            createdAt: now
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
            webhookDispatch(
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
            : getProjectUsers(projectId)
                  .filter(u => u.roles?.includes('reviewer') || u.roles?.includes('admin'))
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
        throw new Error('Failed to submit for review');
    }
}

/**
 * Approve a review. Only users with 'reviewer' or 'admin' role. Sets entry to published (auto_publish mode).
 */
export async function approveReview(
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
            if (page) {
                await putProjectJson(projectId, pageKey(review.pageId), {
                    ...page,
                    status: 'published'
                });
            }
            triggerEvent('content.saved', {
                projectId,
                paths: [REVIEWS_KEY, pageKey(review.pageId)],
                message: `Approve review (page) — ${normalizeUserName(user)}`,
                user
            });
            log(toActivityEvent(projectId, 'page', review.pageId, 'approved', user));
            try {
                await triggerEvent('review.approved', { projectId, review: updated });
            } catch {
                // never break on emit failure
            }
            try {
                webhookDispatch(
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
            const entry = await getProjectJson<Entry>(
                projectId,
                entryKey(review.modelId, review.entryId)
            );
            if (entry) {
                await putProjectJson(projectId, entryKey(review.modelId, review.entryId), {
                    ...entry,
                    status: 'published'
                });
            }
            triggerEvent('content.saved', {
                projectId,
                paths: [REVIEWS_KEY, entryKey(review.modelId, review.entryId)],
                message: `Approve review (entry) — ${normalizeUserName(user)}`,
                user
            });
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
                webhookDispatch(
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
        throw new Error('Failed to approve review');
    }
}

/**
 * Reject a review. Only users with 'reviewer' or 'admin' role. Creates a Comment with the reason, sets entry back to draft.
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
                await putProjectJson(projectId, pageKey(review.pageId), {
                    ...page,
                    status: 'draft'
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
                webhookDispatch(
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
                webhookDispatch(
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
        throw new Error('Failed to reject review');
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
    return reviews.length > 0;
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
    return reviews.length > 0;
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
    if (!project.workflow?.enabled) {
        throw new Error('Review workflow is not enabled for this project');
    }

    const page = await getProjectJson<PageNode>(projectId, pageKey(pageId));
    if (!page) {
        throw new Error(`Page "${pageId}" not found in project "${projectId}".`);
    }
    if (page.type === 'folder') {
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
        createdAt: now
    };
    list.push(review);
    await putProjectJson(projectId, REVIEWS_KEY, list);

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
        : getProjectUsers(projectId)
              .filter(u => u.roles?.includes('reviewer') || u.roles?.includes('admin'))
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

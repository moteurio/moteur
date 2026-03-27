import type { Express } from 'express';
import { onEvent } from '@moteurio/core/utils/eventBus.js';

type IOServer = {
    to(room: string): { emit(ev: string, data?: unknown): void };
};

function getIO(app: Express): IOServer | undefined {
    return app.locals?.io as IOServer | undefined;
}

/**
 * Forwards core domain events to Socket.IO project rooms (presence).
 */
export function registerSocketEventBridge(app: Express): void {
    const safeEmit = (projectId: string, emitFn: (io: IOServer) => void): void => {
        const io = getIO(app);
        if (!io) return;
        try {
            emitFn(io);
        } catch {
            // never break on emit failure
        }
    };

    onEvent('activity.logged', async ctx => {
        safeEmit(ctx.event.projectId, io =>
            io.to(ctx.event.projectId).emit('activity:event', ctx.event)
        );
    });
    onEvent('comment.added', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('comment:added', ctx.comment));
    });
    onEvent('comment.resolved', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('comment:resolved', ctx.comment));
    });
    onEvent('comment.deleted', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('comment:deleted', { id: ctx.id }));
    });
    onEvent('comment.edited', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('comment:edited', ctx.comment));
    });
    onEvent('review.submitted', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('review:submitted', ctx.review));
    });
    onEvent('review.approved', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('review:approved', ctx.review));
    });
    onEvent('review.rejected', async ctx => {
        safeEmit(ctx.projectId, io => io.to(ctx.projectId).emit('review:rejected', ctx.review));
    });
    onEvent('review.entryStatusChanged', async ctx => {
        safeEmit(ctx.projectId, io =>
            io.to(ctx.projectId).emit('review:status_changed', {
                entryId: ctx.entryId,
                modelId: ctx.modelId,
                status: ctx.status
            })
        );
    });
    onEvent('review.pageStatusChanged', async ctx => {
        safeEmit(ctx.projectId, io =>
            io.to(ctx.projectId).emit('review:status_changed', {
                pageId: ctx.pageId,
                templateId: ctx.templateId,
                status: ctx.status
            })
        );
    });
    onEvent('asset:ready', async ctx => {
        safeEmit(ctx.asset.projectId, io =>
            io.to(ctx.asset.projectId).emit('asset:ready', ctx.asset)
        );
    });
    onEvent('asset:error', async ctx => {
        safeEmit(ctx.projectId, io =>
            io.to(ctx.projectId).emit('asset:error', {
                id: ctx.id,
                projectId: ctx.projectId,
                error: ctx.error
            })
        );
    });
}

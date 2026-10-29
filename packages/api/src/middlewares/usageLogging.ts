import { Request, Response, NextFunction } from 'express';
import { recordImageTraffic } from '@moteurio/core/metering.js';
import { recordStudioRequest, recordPublicRequest } from '../usage/usageStore.js';
import { logRequest } from '../usage/requestLogger.js';

/**
 * Records the request in the usage store (studio vs public, separate counters)
 * and appends to the audit log file if configured.
 * Call after requestClassifier. Runs on response finish so status code is known.
 */
export function usageLogging(req: Request, res: Response, next: NextFunction): void {
    const type = req.apiRequestType ?? null;
    const projectId = req.apiRequestProjectId;
    const startTime = Date.now();

    function onFinish(): void {
        res.removeListener('finish', onFinish);
        if (type === 'studio') {
            recordStudioRequest();
        } else if (type === 'public' && projectId && !res.locals.overQuota) {
            recordPublicRequest(projectId);
        } else if (type === 'image' && projectId && req.method === 'GET') {
            // What was sent: an image, or part of one (a video's range). A 304 sent nothing.
            const sent = Number(res.getHeader('content-length'));
            if ((res.statusCode === 200 || res.statusCode === 206) && sent > 0)
                recordImageTraffic(projectId, sent);
        }
        logRequest(req, res, type, projectId, startTime);
    }

    res.on('finish', onFinish);
    next();
}

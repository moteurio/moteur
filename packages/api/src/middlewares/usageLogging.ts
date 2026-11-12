import { Request, Response, NextFunction } from 'express';
import { recordImageTraffic } from '@moteurio/core/metering.js';
import { recordStudioRequest, recordPublicRequest } from '../usage/usageStore.js';
import { logRequest } from '../usage/requestLogger.js';

/**
 * Records the request in the usage store, with separate counters for admin client and public
 * requests, and appends to the audit log file if one is configured.
 * Must run after requestClassifier. It records when the response finishes so the status code is known.
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
            // Count the bytes actually sent: a whole image, or part of one for a video range request. A 304 sends no body.
            const sent = Number(res.getHeader('content-length'));
            if ((res.statusCode === 200 || res.statusCode === 206) && sent > 0)
                recordImageTraffic(projectId, sent);
        }
        logRequest(req, res, type, projectId, startTime);
    }

    res.on('finish', onFinish);
    next();
}

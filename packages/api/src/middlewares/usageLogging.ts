import { Request, Response, NextFunction } from 'express';
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
        } else if (type === 'public' && projectId) {
            recordPublicRequest(projectId);
        }
        logRequest(req, res, type, projectId, startTime);
    }

    res.on('finish', onFinish);
    next();
}

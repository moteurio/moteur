import type { NextFunction, Request, Response } from 'express';
import { publicRequestCount } from '@moteurio/core/metering.js';
import { assertRequestRoom, PlanLimitError } from '@moteurio/core/planLimits.js';
import { sendApiError } from '../utils/apiError.js';

/**
 * Turns public requests away (402 `plan_limit`, `limit: requests`) once the project has answered
 * its monthly quota; a host sets the quota (`setRequestQuota`), otherwise there is none. Turned
 * away requests aren't counted. Must be used after requestClassifier.
 */
export function requestQuota(req: Request, res: Response, next: NextFunction): void {
    const projectId = req.apiRequestProjectId;
    if (req.apiRequestType !== 'public' || !projectId) return next();
    try {
        assertRequestRoom(projectId, publicRequestCount(projectId));
    } catch (err) {
        if (!(err instanceof PlanLimitError)) return next();
        res.locals.overQuota = true;
        return void sendApiError(res, req, err);
    }
    next();
}

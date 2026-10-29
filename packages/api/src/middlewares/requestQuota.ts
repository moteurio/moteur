import type { NextFunction, Request, Response } from 'express';
import { imageTraffic, publicRequestCount } from '@moteurio/core/metering.js';
import {
    assertImageTrafficRoom,
    assertRequestRoom,
    PlanLimitError
} from '@moteurio/core/planLimits.js';
import { sendApiError } from '../utils/apiError.js';

/**
 * Turns public requests away (402 `plan_limit`, `limit: requests`) once the project has answered
 * its monthly quota, and images (`limit: imageTraffic`) once it has sent its month's bytes of
 * them; a host sets the quotas (`setRequestQuota`, `setImageTrafficQuota`), otherwise there are
 * none. Turned away requests aren't counted. Must be used after requestClassifier.
 */
export function requestQuota(req: Request, res: Response, next: NextFunction): void {
    const projectId = req.apiRequestProjectId;
    const type = req.apiRequestType;
    if ((type !== 'public' && type !== 'image') || !projectId) return next();
    try {
        if (type === 'image') assertImageTrafficRoom(projectId, imageTraffic(projectId).bytes);
        else assertRequestRoom(projectId, publicRequestCount(projectId));
    } catch (err) {
        if (!(err instanceof PlanLimitError)) return next();
        res.locals.overQuota = true;
        // Not to be kept by a browser or CDN: the image comes back with the next month or plan.
        if (type === 'image') res.setHeader('Cache-Control', 'no-store');
        return void sendApiError(res, req, err);
    }
    next();
}

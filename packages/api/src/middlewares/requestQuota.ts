import type { NextFunction, Request, Response } from 'express';
import { imageTraffic, publicRequestCount } from '@moteurio/core/metering.js';
import {
    assertImageTrafficRoom,
    assertRequestRoom,
    PlanLimitError
} from '@moteurio/core/planLimits.js';
import { sendApiError } from '../utils/apiError.js';

/**
 * Rejects public requests with 402 `plan_limit` (`limit: requests`) once the project has used its
 * monthly request quota, and image requests (`limit: imageTraffic`) once it has used its monthly
 * image bytes. A host sets the quotas with `setRequestQuota` and `setImageTrafficQuota`; without
 * them there are no limits. Rejected requests are not counted. Must run after requestClassifier.
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
        // Prevent browsers and CDNs from caching the refusal, since the image becomes available again next month or on a larger plan.
        if (type === 'image') res.setHeader('Cache-Control', 'no-store');
        return void sendApiError(res, req, err);
    }
    next();
}

import type { Request, Response, NextFunction } from 'express';
import { boundedSetting } from '@moteurio/core/utils/workBudget.js';
let active = 0;
/** Admit before multer allocates its memory buffer; excess requests receive retryable backpressure. */
export function uploadAdmission(_req: Request, res: Response, next: NextFunction): void {
    if (active >= boundedSetting('API_UPLOAD_CONCURRENCY', 2, 8)) {
        res.setHeader('Retry-After', '5');
        res.status(429).json({
            error: 'Uploads are busy. Try again shortly.',
            code: 'UPLOAD_CAPACITY'
        });
        return;
    }
    active++;
    let released = false;
    const release = () => {
        if (!released) {
            released = true;
            active--;
        }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
}

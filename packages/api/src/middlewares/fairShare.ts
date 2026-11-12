import type { NextFunction, Request, Response } from 'express';

/**
 * Gives each project's sites a fair share of the server. A limited number of the project's requests
 * run at once, and further requests wait in a queue instead of being refused. A static site build,
 * which requests everything in a burst, completes at the server's pace, and a runaway loop or
 * scraper on one project cannot starve the others. Only requests that do not fit in the queue, or
 * wait too long, are rejected (429, Retry-After: 1). The monthly quota (requestQuota) is the
 * plan's separate cap.
 *
 * Reads and images use separate queues so a page's pictures do not delay its content.
 * Settings: MOTEUR_PUBLIC_CONCURRENCY (10), MOTEUR_PUBLIC_QUEUE (200), MOTEUR_PUBLIC_QUEUE_SECONDS (10).
 */

type Lane = { active: number; waiting: Array<() => void> };

const lanes = new Map<string, Lane>();

function setting(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** How many of a project's requests may run at once. */
const concurrency = () => Math.floor(setting('MOTEUR_PUBLIC_CONCURRENCY', 10));
/** How many requests may wait in the queue. */
const queueLength = () => Math.floor(setting('MOTEUR_PUBLIC_QUEUE', 200));
/** How long a request may wait before it is rejected with a retry hint. */
const maxWaitMs = () => setting('MOTEUR_PUBLIC_QUEUE_SECONDS', 10) * 1000;

function busy(res: Response): void {
    res.setHeader('Retry-After', '1');
    res.setHeader('Cache-Control', 'no-store');
    res.status(429).json({
        error: 'This project is answering many requests at once. Try again in a second.',
        code: 'rate_limited'
    });
}

/** Limits `public` and `image` requests per project. Must run after requestClassifier, which sets the request type. */
export function fairShare(req: Request, res: Response, next: NextFunction): void {
    const type = req.apiRequestType;
    const projectId = req.apiRequestProjectId;
    if ((type !== 'public' && type !== 'image') || !projectId) return next();

    const key = `${type}:${projectId}`;
    let lane = lanes.get(key);
    if (!lane) lanes.set(key, (lane = { active: 0, waiting: [] }));
    const own = lane;

    // Release the slot exactly once, when the response finishes or the client disconnects.
    let done = false;
    const release = () => {
        if (done) return;
        done = true;
        const nextInLine = own.waiting.shift();
        if (nextInLine) nextInLine();
        else if (--own.active === 0) lanes.delete(key);
    };
    const start = () => {
        res.once('finish', release);
        res.once('close', release);
        next();
    };

    if (own.active < concurrency()) {
        own.active++;
        return start();
    }
    if (own.waiting.length >= queueLength()) return busy(res);

    // Wait in the queue; a slot is handed over when another request releases one. Give up after the maximum wait.
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const turn = () => {
        globalThis.clearTimeout(timer);
        if (res.writableEnded || res.destroyed) return release();
        start();
    };
    own.waiting.push(turn);
    timer = globalThis.setTimeout(() => {
        const i = own.waiting.indexOf(turn);
        if (i !== -1) own.waiting.splice(i, 1);
        busy(res);
    }, maxWaitMs());
    // If the client disconnects while waiting, remove the request from the queue.
    res.once('close', () => {
        const i = own.waiting.indexOf(turn);
        if (i === -1) return;
        own.waiting.splice(i, 1);
        globalThis.clearTimeout(timer);
    });
}

/** Clears all queues (for tests). */
export function resetFairShare(): void {
    lanes.clear();
}

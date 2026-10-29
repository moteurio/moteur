import type { NextFunction, Request, Response } from 'express';

/**
 * A fair share of the server for each project's sites: so many of its requests answered at once,
 * the next ones waiting their turn instead of being refused. A static site's build, which asks
 * for everything in a burst, goes through at the server's pace; a runaway loop or a scraper on one
 * project can't take the server from the others. Only what doesn't fit in the queue, or waits too
 * long, is turned away (429, Retry-After: 1). The monthly quota (requestQuota) is the plan's cap.
 *
 * Sites' reads and images are shared apart, so a page's pictures don't hold up its content.
 * MOTEUR_PUBLIC_CONCURRENCY (10), MOTEUR_PUBLIC_QUEUE (200), MOTEUR_PUBLIC_QUEUE_SECONDS (10).
 */

type Lane = { active: number; waiting: Array<() => void> };

const lanes = new Map<string, Lane>();

function setting(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** How many of a project's requests are answered at once. */
const concurrency = () => Math.floor(setting('MOTEUR_PUBLIC_CONCURRENCY', 10));
/** How many may wait for their turn. */
const queueLength = () => Math.floor(setting('MOTEUR_PUBLIC_QUEUE', 200));
/** How long one may wait before being told to retry. */
const maxWaitMs = () => setting('MOTEUR_PUBLIC_QUEUE_SECONDS', 10) * 1000;

function busy(res: Response): void {
    res.setHeader('Retry-After', '1');
    res.setHeader('Cache-Control', 'no-store');
    res.status(429).json({
        error: 'This project is answering many requests at once. Try again in a second.',
        code: 'rate_limited'
    });
}

/** Must run after requestClassifier: it shares what sites ask for (`public`, `image`) per project. */
export function fairShare(req: Request, res: Response, next: NextFunction): void {
    const type = req.apiRequestType;
    const projectId = req.apiRequestProjectId;
    if ((type !== 'public' && type !== 'image') || !projectId) return next();

    const key = `${type}:${projectId}`;
    let lane = lanes.get(key);
    if (!lane) lanes.set(key, (lane = { active: 0, waiting: [] }));
    const own = lane;

    // The turn ends once, when the answer is sent or the visitor goes away.
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

    // Waits for a turn (the slot passes to it as another request ends), or gives up.
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
    // A visitor gone while waiting gives their place up.
    res.once('close', () => {
        const i = own.waiting.indexOf(turn);
        if (i === -1) return;
        own.waiting.splice(i, 1);
        globalThis.clearTimeout(timer);
    });
}

/** Forget every lane (tests). */
export function resetFairShare(): void {
    lanes.clear();
}

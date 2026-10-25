import { AsyncLocalStorage } from 'node:async_hooks';
import { projectDir } from './pathUtils.js';

const tails = new Map<string, Promise<void>>();
const held = new AsyncLocalStorage<Map<string, { active: boolean }>>();

/** Serialize authoring and branch mutations in the supported single-writer process. */
export async function withProjectWriteLock<T>(
    projectId: string,
    work: () => Promise<T>
): Promise<T> {
    return withWriteLock(projectDir(projectId), work);
}

/** Other single-writer resources, notably users.json, use the same reentrant queue. */
export async function withWriteLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (held.getStore()?.get(key)?.active) return work();
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>(resolve => {
        release = resolve;
    });
    tails.set(key, next);
    await previous;
    const lease = { active: true };
    try {
        return await held.run(new Map([...(held.getStore() ?? []), [key, lease]]), work);
    } finally {
        lease.active = false;
        release();
        if (tails.get(key) === next) tails.delete(key);
    }
}

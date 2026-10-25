import { AsyncLocalStorage } from 'node:async_hooks';
/** Bounded process-wide work. Queued callers do not start allocating processor resources. */
export class WorkBudget {
    private readonly held = new AsyncLocalStorage<{ active: boolean }>();
    private active = 0;
    private readonly waiting: Array<() => void> = [];
    constructor(
        private readonly concurrency: number,
        private readonly maxQueued: number
    ) {}
    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.held.getStore()?.active) return work();
        if (this.active < this.concurrency) this.active++;
        else {
            if (this.waiting.length >= this.maxQueued)
                throw Object.assign(new Error('Server is busy. Try again shortly.'), {
                    status: 429,
                    code: 'WORK_CAPACITY'
                });
            await new Promise<void>(resolve => {
                this.waiting.push(resolve);
            });
        }
        const lease = { active: true };
        try {
            return await this.held.run(lease, work);
        } finally {
            lease.active = false;
            const next = this.waiting.shift();
            if (next) next();
            else this.active--;
        }
    }
}
export function boundedSetting(name: string, fallback: number, maximum: number): number {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

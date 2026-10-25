import type { Entry } from '@moteurio/types/Model.js';
import type { EntryResolver } from '@moteurio/core/referenceResolution.js';
import { boundedSetting } from '@moteurio/core/utils/workBudget.js';

/** One shared budget across every root and recursive reference in a delivery request. */
export class EntryReadBudget {
    private references = 0;
    private bytes = 0;
    private stopped = false;
    private readonly cache = new Map<string, Promise<Entry | null>>();
    constructor(
        private readonly fetch: EntryResolver,
        private readonly maxReferences = boundedSetting('API_READ_MAX_REFERENCES', 200, 2000),
        private readonly maxBytes = boundedSetting(
            'API_READ_MAX_BYTES',
            8 * 1024 * 1024,
            64 * 1024 * 1024
        )
    ) {}
    private exceeded(): never {
        this.stopped = true;
        throw Object.assign(
            new Error('This query is too large. Reduce the page size or reference expansion.'),
            { status: 422, code: 'READ_BUDGET_EXCEEDED' }
        );
    }
    include(entry: Entry): void {
        this.bytes += Buffer.byteLength(JSON.stringify(entry));
        if (this.stopped || this.bytes > this.maxBytes) this.exceeded();
    }
    readonly resolve: EntryResolver = async (projectId, modelId, entryId) => {
        if (this.stopped || ++this.references > this.maxReferences) this.exceeded();
        const key = JSON.stringify([projectId, modelId, entryId]);
        let pending = this.cache.get(key);
        if (!pending) {
            pending = this.fetch(projectId, modelId, entryId);
            this.cache.set(key, pending);
        }
        const entry = await pending;
        // Charge repeated inlining too: a shared cache must not allow response amplification.
        if (entry) this.include(entry);
        return entry;
    };
}

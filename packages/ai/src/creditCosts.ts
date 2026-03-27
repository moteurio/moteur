/**
 * Configurable credit costs per operation.
 * Override via env: MOTEUR_AI_CREDIT_COSTS (JSON object, e.g. {"write.draft":5}).
 * Missing keys fall back to DEFAULT_CREDIT_COSTS.
 */

export const DEFAULT_CREDIT_COSTS: Record<string, number> = {
    'write.draft': 2,
    'write.draft_long': 5,
    'write.rewrite': 2,
    'write.shorten': 2,
    'write.expand': 2,
    'write.tone': 1,
    'write.summarise_excerpt': 2,
    'translate.field': 1,
    'translate.rich_text': 2,
    'translate.entry': 5,
    'translate.block': 1,
    'generate.entry': 5,
    'analyse.image': 2,
    'generate.image': 10
};

let overrides: Record<string, number> | null = null;

function getOverrides(): Record<string, number> {
    if (overrides !== null) return overrides;
    const raw = process.env.MOTEUR_AI_CREDIT_COSTS;
    if (!raw || typeof raw !== 'string') {
        overrides = {};
        return overrides;
    }
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        overrides = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && v >= 0) overrides[k] = v;
        }
        return overrides;
    } catch {
        overrides = {};
        return overrides;
    }
}

/**
 * Returns the credit cost for an operation. Uses env override when set, else default.
 */
export function getCreditCost(operation: string): number {
    const ov = getOverrides();
    if (ov[operation] !== undefined) return ov[operation];
    return DEFAULT_CREDIT_COSTS[operation] ?? 1;
}

/**
 * For tests: reset the parsed env cache.
 */
export function resetCreditCostOverrides(): void {
    overrides = null;
}

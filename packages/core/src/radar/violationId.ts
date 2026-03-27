/**
 * Deterministic violation ID for deduplication and resolved webhooks.
 * Format: {ruleId}:{entrySlug}:{fieldPath}:{locale}
 */
export function makeViolationId(
    ruleId: string,
    entrySlug: string,
    fieldPath?: string,
    locale?: string
): string {
    const parts = [ruleId, entrySlug, fieldPath ?? '', locale ?? ''];
    return parts.join(':');
}

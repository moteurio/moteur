/**
 * Strips the `ui` hint from field definitions before returning to public API consumers.
 * The ui hint is for Studio/frontend rendering only and must never appear in public API responses.
 */

export function stripUiFromFieldSchema<T extends Record<string, unknown>>(schema: T): T {
    if (!schema || typeof schema !== 'object') return schema;
    const result = { ...schema } as Record<string, unknown>;

    if (result.optionsSchema && typeof result.optionsSchema === 'object') {
        const opts = { ...(result.optionsSchema as Record<string, unknown>) };
        delete opts.ui;
        result.optionsSchema = opts;
    }

    if (result.fields && typeof result.fields === 'object') {
        const fields = result.fields as Record<string, unknown>;
        result.fields = Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [
                k,
                stripUiFromFieldSchema((v as Record<string, unknown>) ?? {})
            ])
        );
    }

    return result as T;
}

export function stripUiFromFieldOptions(
    options: Record<string, unknown> | undefined
): Record<string, unknown> {
    if (!options || typeof options !== 'object') return options ?? {};
    const { ui: _ui, ...rest } = options;
    return rest;
}

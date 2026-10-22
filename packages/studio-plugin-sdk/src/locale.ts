/** Read a string or locale map from block/field data. */
export function readLocalizedString(value: unknown, locale?: string): string {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const map = value as Record<string, unknown>;
        if (locale && typeof map[locale] === 'string') return (map[locale] as string).trim();
        for (const v of Object.values(map)) {
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
    }
    return '';
}

export function readStringField(data: Record<string, unknown>, key: string): string {
    const raw = data[key];
    return typeof raw === 'string' ? raw.trim() : readLocalizedString(raw);
}

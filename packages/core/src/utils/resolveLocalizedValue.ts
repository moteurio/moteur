const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE || 'en';

export function resolveLocalizedValue(value: any, locale: string): string {
    if (typeof value === 'string') return value;

    if (value && typeof value === 'object') {
        if (value[locale]) return value[locale];

        const fallbackStrategy = 'default';

        if (fallbackStrategy === 'default' && DEFAULT_LOCALE && value[DEFAULT_LOCALE]) {
            return value[DEFAULT_LOCALE];
        }

        /*if (fallbackStrategy === 'first-available') {
            const first = Object.values(value).find(v => typeof v === 'string');
            if (first) return first;
        }*/
    }

    return '';
}

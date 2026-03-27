export function normalizeType(type: string): string {
    if (!type) {
        return type;
    }
    return type.includes('/') ? type : `core/${type}`;
}

export function isValidId(id: string): boolean {
    return /^[\w-]+$/.test(id);
}

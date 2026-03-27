const PATCH_WINDOW_MS = 1000;
const PATCH_MAX_PER_WINDOW = 50;

const patchTimestampsBySocket = new Map<string, number[]>();

export function allowScreenPatchRateLimit(socketId: string): boolean {
    const now = Date.now();
    let arr = patchTimestampsBySocket.get(socketId) ?? [];
    arr = arr.filter(t => t > now - PATCH_WINDOW_MS);
    if (arr.length >= PATCH_MAX_PER_WINDOW) return false;
    arr.push(now);
    patchTimestampsBySocket.set(socketId, arr);
    return true;
}

export function clearScreenPatchRateLimit(socketId: string): void {
    patchTimestampsBySocket.delete(socketId);
}

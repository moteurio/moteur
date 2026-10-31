import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';

/**
 * When each project API key was last used. Kept with the server's private state, never in the
 * project file: saving a project makes a commit, and reading content must not. Each use is
 * remembered in memory and written at most once a minute per key, so reads stay cheap; what the
 * list of keys shows is never more than that minute behind.
 */

/** `projectId` → `keyId` → ISO date-time. */
type Store = Record<string, Record<string, string>>;

const PERSIST_EVERY_MS = 60_000;

const file = () => privateStatePath('api-key-usage.json');

/** Uses not yet compared with what is on disk, and when each key was last written. */
let memory: { file: string; uses: Store; writtenAt: Map<string, number> } | null = null;

function inMemory() {
    const at = file();
    if (memory?.file !== at) memory = { file: at, uses: {}, writtenAt: new Map() };
    return memory;
}

function readStore(): Store {
    try {
        const raw = readPrivateState<Store>(file(), {});
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
        // Unreadable usage never stops a key from working; the next write starts it again.
        return {};
    }
}

const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

/** Everything known: what is on disk, with newer uses from memory. */
function merged(): Store {
    const store = readStore();
    for (const [projectId, keys] of Object.entries(inMemory().uses)) {
        const row = (store[projectId] ??= {});
        for (const [keyId, at] of Object.entries(keys)) row[keyId] = later(row[keyId], at)!;
    }
    return store;
}

function save(store: Store): void {
    try {
        writePrivateState(file(), store);
    } catch (err) {
        console.error(
            '[moteur] API key use could not be saved:',
            err instanceof Error ? err.message : err
        );
    }
}

/** A request was authenticated with this key. */
export function noteApiKeyUse(projectId: string, keyId: string, now = Date.now()): void {
    const state = inMemory();
    (state.uses[projectId] ??= {})[keyId] = new Date(now).toISOString();
    const id = `${projectId}/${keyId}`;
    if (now - (state.writtenAt.get(id) ?? -Infinity) < PERSIST_EVERY_MS) return;
    state.writtenAt.set(id, now);
    save(merged());
}

/** When each of a project's keys was last used, by key id; keys never used are left out. */
export function apiKeyLastUses(projectId: string): Record<string, string> {
    return { ...(merged()[projectId] ?? {}) };
}

/** A key was rotated or revoked: its last use was the old secret's. */
export function forgetApiKeyUse(projectId: string, keyId: string): void {
    const state = inMemory();
    delete state.uses[projectId]?.[keyId];
    state.writtenAt.delete(`${projectId}/${keyId}`);
    const store = readStore();
    if (!store[projectId]?.[keyId]) return;
    delete store[projectId][keyId];
    if (Object.keys(store[projectId]).length === 0) delete store[projectId];
    save(store);
}

import type { AssistedMark, AssistHelper } from '@moteurio/types/Model.js';

const HELPERS: AssistHelper[] = ['write', 'translate', 'notes', 'alt', 'audio', 'model3d'];
/** `title`, `body`, or one language of a field: `title.en`. */
const KEY = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?$/;

/**
 * The marks to store, from what a client sent: which fields hold text a helper wrote, and
 * whether someone has read them. Who kept a mark and who read it are always stamped here,
 * never taken from the client: keeping it as it was, or the current person when it's new.
 * A field left out loses its mark. Returns undefined when nothing is marked.
 */
export function stampAssisted(
    before: Record<string, AssistedMark> | undefined,
    incoming: unknown,
    userId: string,
    now: string = new Date().toISOString()
): Record<string, AssistedMark> | undefined {
    if (incoming === null) return undefined;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
        throw new Error('"meta.assisted" must map field names to marks.');
    const out: Record<string, AssistedMark> = {};
    for (const [key, raw] of Object.entries(incoming as Record<string, unknown>)) {
        if (!KEY.test(key)) throw new Error(`"meta.assisted": "${key}" is not a field name.`);
        if (!raw || typeof raw !== 'object')
            throw new Error(`"meta.assisted.${key}" must be a mark.`);
        const m = raw as {
            helper?: unknown;
            action?: unknown;
            read?: unknown;
            readBy?: unknown;
            /** Just kept: a new suggestion replaced the text, even if of the same kind. */
            kept?: unknown;
        };
        if (!HELPERS.includes(m.helper as AssistHelper))
            throw new Error(`"meta.assisted.${key}.helper" must be one of ${HELPERS.join(', ')}.`);
        const prev = before?.[key];
        const same =
            m.kept !== true && prev && prev.helper === m.helper && prev.action === m.action;
        const mark: AssistedMark = {
            helper: m.helper as AssistHelper,
            ...(typeof m.action === 'string' && m.action ? { action: m.action.slice(0, 40) } : {}),
            keptBy: same ? prev.keptBy : userId,
            keptAt: same ? prev.keptAt : now
        };
        // Read once stays read (until the text is replaced by a new suggestion).
        const read =
            m.read === true || Boolean(m.readBy) || (same && prev.readBy && m.read !== false);
        if (read) {
            mark.readBy = same && prev.readBy ? prev.readBy : userId;
            mark.readAt = same && prev.readAt ? prev.readAt : now;
        }
        out[key] = mark;
    }
    return Object.keys(out).length ? out : undefined;
}

/** Whether a save brings in helper text that wasn't there before (for "with help" in history). */
export function addsAssisted(
    before: Record<string, AssistedMark> | undefined,
    after: Record<string, AssistedMark> | undefined
): boolean {
    return Object.entries(after ?? {}).some(([k, m]) => {
        const p = before?.[k];
        return !p || p.keptAt !== m.keptAt;
    });
}

/** Fields whose helper text nobody has read yet. */
export function unreadAssisted(marks: Record<string, AssistedMark> | undefined): string[] {
    return Object.entries(marks ?? {})
        .filter(([, m]) => !m.readBy)
        .map(([k]) => k);
}

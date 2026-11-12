import { createHash } from 'node:crypto';
import type { Entry } from '@moteurio/types/Model.js';

/** Returns an opaque version string for an entry, computed from its content so it works even when the audit plugin is disabled. */
export function entryVersion(entry: Entry): string {
    return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

import { createHash } from 'node:crypto';
import type { Entry } from '@moteurio/types/Model.js';

/** An opaque authoring version, independent of whether the audit plugin is enabled. */
export function entryVersion(entry: Entry): string {
    return createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

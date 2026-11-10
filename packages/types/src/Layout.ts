import type { Audit } from './Audit.js';
import { Block } from './Block.js';

export interface Layout {
    id: string; // Unique layout ID, also used as the filename
    label: string; // Display name
    description?: string; // Description of the layout
    project?: string; // ID of the project that owns the layout
    blocks: Block[]; // Content blocks in the layout
    meta?: {
        audit?: Audit;
    };
    locales?: string[]; // Locales the layout supports
    conditions?: Record<string, any>; // Rules that decide when the layout is visible
}

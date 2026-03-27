import type { Audit } from './Audit.js';
import { Block } from './Block.js';

export interface Layout {
    id: string; // Unique layout ID (used as filename)
    label: string; // Human-friendly name
    description?: string; // Optional description
    project?: string; // Project ID (optional but useful)
    blocks: Block[]; // Array of content blocks
    meta?: {
        audit?: Audit;
    };
    locales?: string[]; // Optional supported locales
    conditions?: Record<string, any>; // Optional visibility rules
}

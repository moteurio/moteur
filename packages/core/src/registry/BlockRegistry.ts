import { BlockSchema } from '@moteurio/types/Block.js';
import { listBlocks } from '../blocks.js';

export class BlockRegistry {
    private schemas: Record<string, BlockSchema>;

    /** @param projectId - When set, merges `data/projects/&lt;id&gt;/blocks` with core and plugins. */
    constructor(projectId?: string) {
        this.schemas = listBlocks(projectId);
    }

    get(type: string): BlockSchema | undefined {
        return this.schemas[type] || this.schemas[`core/${type}`];
    }

    has(type: string): boolean {
        return !!this.get(type);
    }

    all(): Record<string, BlockSchema> {
        return this.schemas;
    }
}

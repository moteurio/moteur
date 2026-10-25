export type DeliveryBlock<TData = Record<string, unknown>> = {
    type: string;
    data: TData;
};

export type BlockRenderer<TData = Record<string, unknown>> = (
    block: DeliveryBlock<TData>,
    locale: string
) => unknown;

export type BlockRegistryOptions = {
    load: (type: string) => Promise<{ render: BlockRenderer } | BlockRenderer>;
    fallback?: BlockRenderer;
    /** When true, log missing renderers (default: true in development). */
    warnOnMissing?: boolean;
};

export function createBlockRegistry(options: BlockRegistryOptions) {
    const cache = new Map<string, BlockRenderer>();
    const warn =
        options.warnOnMissing ??
        (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');

    async function resolveRenderer(type: string): Promise<BlockRenderer | undefined> {
        if (cache.has(type)) return cache.get(type);
        try {
            const mod = await options.load(type);
            const render = typeof mod === 'function' ? mod : mod.render;
            cache.set(type, render);
            return render;
        } catch {
            return undefined;
        }
    }

    return {
        async renderBlock(block: DeliveryBlock, locale: string): Promise<unknown> {
            if (!block?.type) return undefined;
            const render = await resolveRenderer(block.type);
            if (render) return render(block, locale);
            if (options.fallback) return options.fallback(block, locale);
            if (warn) {
                console.warn(`[moteur] No renderer for block type: ${block.type}`);
            }
            return undefined;
        },
        async renderBlocks(blocks: DeliveryBlock[], locale: string): Promise<unknown[]> {
            const out: unknown[] = [];
            for (const block of blocks) {
                out.push(await this.renderBlock(block, locale));
            }
            return out;
        }
    };
}

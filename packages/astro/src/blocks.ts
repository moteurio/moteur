/**
 * One component per block type, checked: `defineBlocks<MoteurSchema>({ hero: Hero, … })` fails
 * `astro check` when a block type has no component, or a component's props don't fit its data.
 */
import type { SchemaShape } from '@moteurio/client';

/** A block as delivered. */
export type AnyBlock = { type: string; data: unknown };

/** The project's blocks, in one language (from `moteur types`). */
type BlocksOf<S extends SchemaShape> = S['one'] extends {
    blocks: infer B extends AnyBlock;
}
    ? B
    : AnyBlock;

/**
 * What a block component is given: the block's data, the block itself, and what the page shares
 * with every block (`shared` on `<Blocks>`: its address, the site's words…).
 */
export type BlockProps<B extends AnyBlock, Shared = {}> = { data: B['data']; block: B } & Shared;

/** An Astro component (or any function component) for a block. */
export type BlockComponent<B extends AnyBlock, Shared = {}> = (
    props: BlockProps<B, Shared>
) => unknown;

/**
 * A component for every block type the content can hold, by its type: the project's own by their
 * name (`hero`), the server's with their namespace (`core/quote`).
 */
export type BlockComponents<S extends SchemaShape, Shared = {}> = {
    [B in BlocksOf<S> as B['type']]: BlockComponent<B, Shared>;
};

export interface DefinedBlocks<Shared = {}> {
    /** The component for this block, or nothing for a type the site doesn't know yet. */
    for(block: AnyBlock): BlockComponent<AnyBlock, Shared> | undefined;
}

const warned = new Set<string>();
const inDev = () =>
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
        ?.NODE_ENV !== 'production';

/**
 * `Shared`: what every block also gets from the page, given once as `<Blocks shared={…}>`. A
 * component may take any part of it; one asking for more than the page shares fails `astro check`.
 */
export function defineBlocks<S extends SchemaShape, Shared = {}>(
    components: BlockComponents<S, Shared>
): DefinedBlocks<Shared> {
    const map = components as unknown as Record<string, BlockComponent<AnyBlock, Shared>>;
    return {
        for(block) {
            const type = block.type;
            const found = map[type];
            if (!found && inDev() && !warned.has(type)) {
                // A type made in Studio before the site has a component for it: skipped, not fatal.
                warned.add(type);
                console.warn(`[moteur] No component for block "${type}": it is skipped.`);
            }
            return found;
        }
    };
}

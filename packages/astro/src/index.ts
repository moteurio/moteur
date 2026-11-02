import {
    createMoteurPublicClient,
    type MoteurPublicClientConfig,
    type MoteurPublicClient,
    type SchemaShape,
    type UntypedSchema
} from '@moteurio/client';
import { env } from './env.js';

export type CreateMoteurOptions = MoteurPublicClientConfig;

/**
 * The client a site reads with. The key is enough: `createMoteur<MoteurSchema>()` reads
 * `MOTEUR_API_KEY` (and `MOTEUR_API_URL` for a server of your own), and the key says its project
 * and channel. Give `moteur types`'s `MoteurSchema` and every answer is typed.
 */
export function createMoteur<S extends SchemaShape = UntypedSchema>(
    config: CreateMoteurOptions = {}
): MoteurPublicClient<S> {
    const apiKey = config.apiKey ?? (config.auth ? undefined : env('MOTEUR_API_KEY'));
    if (!apiKey && !config.auth)
        throw new Error(
            'Moteur: set MOTEUR_API_KEY, a read-only key for the channel (Studio › Setup › Keys)'
        );
    return createMoteurPublicClient<S>({
        ...config,
        apiKey,
        baseURL: config.baseURL ?? env('MOTEUR_API_URL')
    });
}

export {
    defineBlocks,
    type AnyBlock,
    type BlockComponent,
    type BlockComponents,
    type BlockProps,
    type DefinedBlocks
} from './blocks.js';

export {
    defineTemplates,
    type DefinedTemplates,
    type DeliveredPageLike,
    type PageOf,
    type SitePage,
    type TemplateId,
    type TemplateView,
    type TemplateViews,
    type ViewProps
} from './templates.js';

export { previewPage, type PreviewOptions } from './preview.js';

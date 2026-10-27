import { createMoteurClientInternal } from '../client.js';
import { MoteurClientError } from '../credentials.js';
import { publicCollectionsReadApi } from './collectionsRead.js';
import { createPublicCollectionChannel, type PublicChannel } from './collectionChannel.js';
import type { LocaleMode, SchemaShape, UntypedSchema } from './schema.js';
import { publicSiteOutputsApi } from './pageOutputs.js';
import { publicFormsApi } from './forms.js';
import type { MoteurPublicClientConfig } from '../types.js';

export type MoteurPublicClient<
    S extends SchemaShape = UntypedSchema,
    D extends LocaleMode = 'all'
> = {
    readonly baseURL: string;
    projectId: string;
    /** The language answers come in, when the client was made for one (`locale()`). */
    language?: S['locale'];
    collections: {
        list(): ReturnType<ReturnType<typeof publicCollectionsReadApi>['list']>;
        get(collectionId: string): ReturnType<ReturnType<typeof publicCollectionsReadApi>['get']>;
    };
    /** What a collection delivers: pages, entries, menus, forms, layouts. */
    channel(collectionId: string): PublicChannel<S, D>;
    /** The same client, answering in one language: every value in it, typed as such. */
    locale(locale: S['locale']): MoteurPublicClient<S, 'one'>;
    site: ReturnType<typeof publicSiteOutputsApi>;
    /** Show a form in the visitor's language, and send what they wrote. */
    forms: ReturnType<typeof publicFormsApi>;
    /** Clone this client with a preview token (draft / latest view on collection reads). */
    withPreview(previewToken: string): MoteurPublicClient<S, D>;
};

/**
 * Read-only SDK for a **project API key** (`x-api-key`) and fixed `projectId`.
 * Use `channel(collectionId)` for collection-shaped reads; `forms` to show and send forms; `site` for sitemap / navigation tree / urls / breadcrumb, in any language, and to resolve a path or list redirects.
 *
 * Give it the project's schema (`moteur types` writes `MoteurSchema`) and its answers are typed:
 * `createMoteurPublicClient<MoteurSchema>(…).locale('fr').channel('site').pages.list()`.
 */
export function createMoteurPublicClient<S extends SchemaShape = UntypedSchema>(
    config: MoteurPublicClientConfig
): MoteurPublicClient<S> {
    return build<S, 'all'>(config);
}

function build<S extends SchemaShape, D extends LocaleMode>(
    config: MoteurPublicClientConfig,
    language?: string
): MoteurPublicClient<S, D> {
    const auth = config.auth;
    if (auth.type !== 'apiKey' || !auth.apiKey?.trim()) {
        throw new MoteurClientError({
            code: 'MOTEUR_E_PUBLIC_AUTH',
            message:
                'createMoteurPublicClient requires auth: { type: "apiKey", apiKey, projectId }',
            hint: 'Use createMoteurAdminClient with a JWT for the full API.'
        });
    }
    if (!auth.projectId?.trim()) {
        throw new MoteurClientError({
            code: 'MOTEUR_E_PUBLIC_AUTH',
            message: 'createMoteurPublicClient requires auth.projectId',
            hint: 'The public client is bound to one project; set auth.projectId.'
        });
    }

    const projectId = auth.projectId;
    const client = createMoteurClientInternal({
        baseURL: config.baseURL,
        auth: { type: 'apiKey', apiKey: auth.apiKey, projectId },
        timeout: config.timeout,
        previewToken: config.previewToken
    });

    const collectionsRead = publicCollectionsReadApi(client);

    return {
        get baseURL() {
            return client.baseURL;
        },
        projectId,
        ...(language && { language }),
        collections: {
            list: () => collectionsRead.list(projectId),
            get: (collectionId: string) => collectionsRead.get(projectId, collectionId)
        },
        channel: (collectionId: string) =>
            createPublicCollectionChannel<S, D>(client, projectId, collectionId, language),
        locale: locale => build<S, 'one'>(config, locale),
        site: publicSiteOutputsApi(client, projectId, language),
        forms: publicFormsApi(client, projectId),
        withPreview: previewToken => build<S, D>({ ...config, previewToken }, language)
    };
}

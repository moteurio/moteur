import { createMoteurClientInternal } from '../client.js';
import { MoteurClientError } from '../credentials.js';
import { publicChannelsReadApi } from './channelsRead.js';
import { createPublicChannel, type PublicChannel } from './channel.js';
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
    channels: {
        list(): ReturnType<ReturnType<typeof publicChannelsReadApi>['list']>;
        get(channelId: string): ReturnType<ReturnType<typeof publicChannelsReadApi>['get']>;
    };
    /** What a channel delivers: pages, entries, menus, forms, layouts. */
    channel(channelId: string): PublicChannel<S, D>;
    /** The same client, answering in one language: every value in it, typed as such. */
    locale(locale: S['locale']): MoteurPublicClient<S, 'one'>;
    site: ReturnType<typeof publicSiteOutputsApi>;
    /** Show a form in the visitor's language, and send what they wrote. */
    forms: ReturnType<typeof publicFormsApi>;
    /** Clone this client with a preview token (draft / latest view on channel reads). */
    withPreview(previewToken: string): MoteurPublicClient<S, D>;
};

/**
 * Read-only SDK for a **project API key** (`x-api-key`) and fixed `projectId`.
 * Use `channel(channelId)` for channel-shaped reads; `forms` to show and send forms; `site` for sitemap / navigation tree / urls / breadcrumb, in any language, and to resolve a path or list redirects.
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

    const channelsRead = publicChannelsReadApi(client);

    return {
        get baseURL() {
            return client.baseURL;
        },
        projectId,
        ...(language && { language }),
        channels: {
            list: () => channelsRead.list(projectId),
            get: (channelId: string) => channelsRead.get(projectId, channelId)
        },
        channel: (channelId: string) =>
            createPublicChannel<S, D>(client, projectId, channelId, language),
        locale: locale => build<S, 'one'>(config, locale),
        site: publicSiteOutputsApi(client, projectId, language),
        forms: publicFormsApi(client, projectId),
        withPreview: previewToken => build<S, D>({ ...config, previewToken }, language)
    };
}

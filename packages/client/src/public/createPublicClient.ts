import { createMoteurClientInternal } from '../client.js';
import { MoteurClientError } from '../credentials.js';
import { publicChannelsReadApi } from './channelsRead.js';
import { createPublicChannel, type PublicChannel } from './channel.js';
import type { LocaleMode, SchemaShape, UntypedSchema } from './schema.js';
import { publicSiteOutputsApi } from './pageOutputs.js';
import { publicFormsApi } from './forms.js';
import { DEFAULT_API_URL, type KeyInfo, type MoteurPublicClientConfig } from '../types.js';

export type MoteurPublicClient<
    S extends SchemaShape = UntypedSchema,
    D extends LocaleMode = 'all'
> = {
    readonly baseURL: string;
    /** The project ID. It is known after `whoami()` has resolved, or immediately when `projectId` was given in the config. */
    readonly projectId: string;
    /** Returns information about the API key: its project and channels. The API is asked once and the result is reused. */
    whoami(): Promise<KeyInfo>;
    /** The locale of returned values. Set only when the client was created with `locale()`. */
    language?: S['locale'];
    channels: {
        list(): ReturnType<ReturnType<typeof publicChannelsReadApi>['list']>;
        get(channelId: string): ReturnType<ReturnType<typeof publicChannelsReadApi>['get']>;
    };
    /** Returns read access to a channel's pages, entries, menus, forms and layouts. Without an ID, it uses the key's default channel. */
    channel(channelId?: string): PublicChannel<S, D>;
    /** Returns a client that returns every value in a single locale, and is typed accordingly. */
    locale(locale: S['locale']): MoteurPublicClient<S, 'one'>;
    site: ReturnType<typeof publicSiteOutputsApi>;
    /** Fetches forms in the visitor's locale and submits visitor answers. */
    forms: ReturnType<typeof publicFormsApi>;
    /** Returns a copy of this client that sends a preview token, so channel reads return the latest draft content. */
    withPreview(previewToken: string): MoteurPublicClient<S, D>;
};

/**
 * Creates a read-only SDK client that authenticates with a **project API key** (`x-api-key`):
 * `createMoteurPublicClient({ apiKey })`.
 * The client looks up the key's project and channel once, on the first read.
 * - `channel()` reads the key's default channel, and `channel(id)` reads another channel.
 * - `forms` fetches and submits forms.
 * - `site` provides the sitemap, navigation tree, URLs and breadcrumb in any locale, resolves
 *   paths, and lists redirects.
 *
 * Pass the project's schema (`moteur types` generates `MoteurSchema`) as the type argument to get
 * typed results:
 * `createMoteurPublicClient<MoteurSchema>(…).locale('fr').channel('site').pages.list()`.
 */
export function createMoteurPublicClient<S extends SchemaShape = UntypedSchema>(
    config: MoteurPublicClientConfig
): MoteurPublicClient<S> {
    return build<S, 'all'>(config);
}

/** Placeholder for the project or channel ID until it has been looked up from the key. */
const FROM_KEY = '~key~';

function build<S extends SchemaShape, D extends LocaleMode>(
    config: MoteurPublicClientConfig,
    language?: string,
    shared?: { key?: Promise<KeyInfo> }
): MoteurPublicClient<S, D> {
    const apiKey = (config.apiKey ?? config.auth?.apiKey)?.trim();
    if (!apiKey || (config.auth && config.auth.type !== 'apiKey')) {
        throw new MoteurClientError({
            code: 'MOTEUR_E_PUBLIC_AUTH',
            message: 'createMoteurPublicClient needs a project key: { apiKey }',
            hint: 'Make a read-only key for the channel in Studio (Setup › Keys). For the full API, use createMoteurAdminClient with a sign-in.'
        });
    }
    const knownProject = (config.projectId ?? config.auth?.projectId)?.trim() || undefined;
    const client = createMoteurClientInternal({
        baseURL: config.baseURL?.trim() || DEFAULT_API_URL,
        auth: { type: 'apiKey', apiKey, ...(knownProject && { projectId: knownProject }) },
        timeout: config.timeout,
        previewToken: config.previewToken
    });

    // The key lookup runs once and is shared with the clients derived from this one (`locale`, `withPreview`).
    const memo = shared ?? {};
    let projectId = knownProject;
    const whoami = (): Promise<KeyInfo> => {
        memo.key ??= client.get<KeyInfo>('/keys/me').catch(err => {
            memo.key = undefined;
            throw err;
        });
        return memo.key.then(key => {
            projectId ??= key.projectId;
            return key;
        });
    };
    const channelOf = async (): Promise<string> => {
        if (config.channel) return config.channel;
        const key = await whoami();
        if (key.channel) return key.channel;
        throw new MoteurClientError({
            code: 'MOTEUR_E_CHANNEL',
            message: key.channels.length
                ? `This key reads several channels (${key.channels.join(', ')}): name one, channel('${key.channels[0]}').`
                : 'This key reads no channel.',
            hint: 'Or set `channel` when making the client.'
        });
    };
    // Request URLs use FROM_KEY for IDs that are not known yet. This interceptor replaces it with the real IDs before the request is sent.
    client._raw.interceptors.request.use(async req => {
        const url = req.url ?? '';
        if (!url.includes(FROM_KEY)) return req;
        const project = projectId ?? (await whoami()).projectId;
        let filled = url.replace(
            `/projects/${FROM_KEY}`,
            `/projects/${encodeURIComponent(project)}`
        );
        if (filled.includes(`/channels/${FROM_KEY}`))
            filled = filled.replace(
                `/channels/${FROM_KEY}`,
                `/channels/${encodeURIComponent(await channelOf())}`
            );
        req.url = filled;
        return req;
    });

    const project = knownProject ?? FROM_KEY;
    const channelsRead = publicChannelsReadApi(client);

    return {
        get baseURL() {
            return client.baseURL;
        },
        get projectId() {
            return projectId ?? '';
        },
        whoami,
        ...(language && { language }),
        channels: {
            list: () => channelsRead.list(project),
            get: (channelId: string) => channelsRead.get(project, channelId)
        },
        channel: (channelId?: string) =>
            createPublicChannel<S, D>(
                client,
                project,
                channelId ?? config.channel ?? FROM_KEY,
                language
            ),
        locale: locale => build<S, 'one'>(config, locale, memo),
        site: publicSiteOutputsApi(client, project, language),
        forms: publicFormsApi(client, project),
        withPreview: previewToken => build<S, D>({ ...config, previewToken }, language, memo)
    };
}

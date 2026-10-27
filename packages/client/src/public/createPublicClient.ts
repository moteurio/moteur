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
    /** The project: known once the key has been asked (`whoami()`), or when given. */
    readonly projectId: string;
    /** What the key is: its project and channels. Asked once. */
    whoami(): Promise<KeyInfo>;
    /** The language answers come in, when the client was made for one (`locale()`). */
    language?: S['locale'];
    channels: {
        list(): ReturnType<ReturnType<typeof publicChannelsReadApi>['list']>;
        get(channelId: string): ReturnType<ReturnType<typeof publicChannelsReadApi>['get']>;
    };
    /** What a channel delivers: pages, entries, menus, forms, layouts. Without an id, the key's. */
    channel(channelId?: string): PublicChannel<S, D>;
    /** The same client, answering in one language: every value in it, typed as such. */
    locale(locale: S['locale']): MoteurPublicClient<S, 'one'>;
    site: ReturnType<typeof publicSiteOutputsApi>;
    /** Show a form in the visitor's language, and send what they wrote. */
    forms: ReturnType<typeof publicFormsApi>;
    /** Clone this client with a preview token (draft / latest view on channel reads). */
    withPreview(previewToken: string): MoteurPublicClient<S, D>;
};

/**
 * Read-only SDK for a **project API key** (`x-api-key`): `createMoteurPublicClient({ apiKey })`.
 * The key says its project and channel (asked once, on the first read). Use `channel()` for the
 * key's channel, `channel(id)` for another; `forms` to show and send forms; `site` for sitemap / navigation tree / urls / breadcrumb, in any language, and to resolve a path or list redirects.
 *
 * Give it the project's schema (`moteur types` writes `MoteurSchema`) and its answers are typed:
 * `createMoteurPublicClient<MoteurSchema>(…).locale('fr').channel('site').pages.list()`.
 */
export function createMoteurPublicClient<S extends SchemaShape = UntypedSchema>(
    config: MoteurPublicClientConfig
): MoteurPublicClient<S> {
    return build<S, 'all'>(config);
}

/** Stands for what the key says until it has said it: its project, its channel. */
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

    // Asked once for the client and the clients made from it (locale, preview).
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
    // URLs are written with FROM_KEY for what isn't known yet, and filled in before they go out.
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

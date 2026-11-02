import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react';
import type { MoteurPublicClient } from '@moteurio/client';
import {
    createPreviewSession,
    type DeliveryBlock,
    type PreviewSessionSource
} from '@moteurio/client';

const MoteurContext = createContext<MoteurPublicClient | null>(null);

export type MoteurProviderProps = {
    client: MoteurPublicClient;
    children: ReactNode;
};

export function MoteurProvider({ client, children }: MoteurProviderProps) {
    return <MoteurContext.Provider value={client}>{children}</MoteurContext.Provider>;
}

export function useMoteurClient(): MoteurPublicClient {
    const client = useContext(MoteurContext);
    if (!client) {
        throw new Error('useMoteurClient requires <MoteurProvider>');
    }
    return client;
}

export function useChannel(channelId: string) {
    const client = useMoteurClient();
    return useMemo(() => client.channel(channelId), [client, channelId]);
}

export function usePreview(source: PreviewSessionSource = {}) {
    const session = useMemo(() => createPreviewSession(source), [source.search, source.cookie]);
    const client = useMoteurClient();
    const previewClient = useMemo(
        () => (session.token ? client.withPreview(session.token) : client),
        [client, session.token]
    );
    return { ...session, client: previewClient };
}

export type BlockComponentProps<T = Record<string, unknown>> = {
    data: T;
    locale: string;
};

export type BlocksProps = {
    blocks: DeliveryBlock[];
    locale: string;
    components: Record<string, ComponentType<BlockComponentProps>>;
    fallback?: ComponentType<BlockComponentProps>;
};

export function Blocks({ blocks, locale, components, fallback }: BlocksProps) {
    return (
        <>
            {blocks.map((block, i) => {
                const Cmp = components[block.type] ?? fallback;
                if (!Cmp) return null;
                return <Cmp key={`${block.type}-${i}`} data={block.data} locale={locale} />;
            })}
        </>
    );
}

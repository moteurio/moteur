import { inject, type App, type InjectionKey } from 'vue';
import type { MoteurPublicClient } from '@moteurio/client';
import { createPreviewSession, type PreviewSessionSource } from '@moteurio/client';

const moteurKey: InjectionKey<MoteurPublicClient> = Symbol('moteur');

export function createMoteurPlugin(client: MoteurPublicClient) {
    return {
        install(app: App) {
            app.provide(moteurKey, client);
        }
    };
}

export function useMoteurClient(): MoteurPublicClient {
    const client = inject(moteurKey);
    if (!client) throw new Error('useMoteurClient requires createMoteurPlugin');
    return client;
}

export function useChannel(channelId: string) {
    return useMoteurClient().channel(channelId);
}

export function usePreview(source: PreviewSessionSource = {}) {
    const session = createPreviewSession(source);
    const client = useMoteurClient();
    const previewClient = session.token ? client.withPreview(session.token) : client;
    return { ...session, client: previewClient };
}

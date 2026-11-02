import {
    createMoteurPublicClient,
    createBlockRegistry,
    t,
    siblingPath,
    localeFromPathname,
    createPreviewSession,
    type MoteurPublicClientConfig
} from '@moteurio/client';

export { t, siblingPath, localeFromPathname, createBlockRegistry, createPreviewSession };

export function createVanillaMoteur(config: MoteurPublicClientConfig) {
    const client = createMoteurPublicClient(config);
    return {
        client,
        channel: (channelId: string) => client.channel(channelId),
        withPreview: (token: string) => createMoteurPublicClient({ ...config, previewToken: token })
    };
}

export async function renderBlocksToElement(
    container: HTMLElement,
    blocks: { type: string; data: Record<string, unknown> }[],
    locale: string,
    registry: ReturnType<typeof createBlockRegistry>
): Promise<void> {
    container.innerHTML = '';
    for (const block of blocks) {
        const el = document.createElement('div');
        el.className = `block block--${block.type.replace('/', '-')}`;
        const html = await registry.renderBlock(block, locale);
        if (typeof html === 'string') el.innerHTML = html;
        container.appendChild(el);
    }
}

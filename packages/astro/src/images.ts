/**
 * Support for writing pictures into the site at build time (`<MoteurImage>` with `from="site"`).
 * Astro only downloads and resizes images from hosts that its config allows, so `moteur()` adds
 * Moteur's host to that list.
 *
 *     // astro.config.mjs
 *     import { moteur } from '@moteurio/astro/integration';
 *     export default defineConfig({ integrations: [moteur()] });
 */
import type { AstroIntegration } from 'astro';
import type { ImageSource } from '@moteurio/client';
import { env } from './env.js';

const DEFAULT_API_URL = 'https://api.moteur.io';

export type MoteurIntegrationOptions = {
    /** The API the site reads from. Defaults to `MOTEUR_API_URL`, then to api.moteur.io. */
    apiUrl?: string;
};

/** Allows Astro to download Moteur's pictures during the build and write them into the site as its own files. */
export function moteur(options: MoteurIntegrationOptions = {}): AstroIntegration {
    return {
        name: '@moteurio/astro',
        hooks: {
            'astro:config:setup': ({ config, updateConfig }) => {
                const api = new URL(options.apiUrl ?? env('MOTEUR_API_URL') ?? DEFAULT_API_URL);
                const pattern = {
                    protocol: api.protocol.replace(':', ''),
                    hostname: api.hostname,
                    ...(api.port && { port: api.port })
                };
                updateConfig({
                    image: { remotePatterns: [...(config.image.remotePatterns ?? []), pattern] }
                });
            }
        }
    };
}

/** Returns the URL of the picture as uploaded, before any resizing. */
export function originalOf(image: ImageSource): string | undefined {
    if (!image) return undefined;
    const resolved = (image as { _resolved?: { url?: string } | null })._resolved;
    return resolved !== undefined ? (resolved?.url ?? undefined) : (image as { url?: string }).url;
}

const warned = new Set<string>();

/** Warns once per host that the build could not write the pictures into the site, so Moteur serves them instead. */
export function warnNotAllowed(url: string): void {
    const host = new URL(url).host;
    if (warned.has(host)) return;
    warned.add(host);
    console.warn(
        `[moteur] Pictures from ${host} are served by Moteur, not written into the site: add moteur() from '@moteurio/astro/integration' to the config's integrations (or ${host} to image.domains).`
    );
}

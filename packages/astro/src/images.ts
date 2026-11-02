/**
 * Pictures written into the site at build (`<MoteurImage>`, `from="site"`): Astro downloads and
 * resizes only from hosts its config allows, so `moteur()` allows Moteur's.
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
    /** The API the site reads (default `MOTEUR_API_URL`, else api.moteur.io). */
    apiUrl?: string;
};

/** Lets the build turn Moteur's pictures into the site's own files. */
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

/** The picture as uploaded: its own file, before any resizing. */
export function originalOf(image: ImageSource): string | undefined {
    if (!image) return undefined;
    const resolved = (image as { _resolved?: { url?: string } | null })._resolved;
    return resolved !== undefined ? (resolved?.url ?? undefined) : (image as { url?: string }).url;
}

const warned = new Set<string>();

/** Said once per host: the build couldn't make the site's own files, so Moteur serves them. */
export function warnNotAllowed(url: string): void {
    const host = new URL(url).host;
    if (warned.has(host)) return;
    warned.add(host);
    console.warn(
        `[moteur] Pictures from ${host} are served by Moteur, not written into the site: add moteur() from '@moteurio/astro/integration' to the config's integrations (or ${host} to image.domains).`
    );
}

import fs from 'fs';
import path from 'path';
import type { User } from '@moteurio/types/User.js';

export type BootOptions = {
    /** The directory that contains `data/` (users.json, core/blocks and projects/). */
    dataRoot: string;
    /** The base URL written into uploaded asset URLs (STATIC_ASSETS_BASE_URL). */
    assetBaseUrl: string;
};

let booted = false;

/**
 * Points core at the target data root and registers what the API registers at startup: the field
 * types, the core plugins (audit, activity log, validation and git commits) and the host plugins
 * listed in MOTEUR_HOST_PLUGINS, for example geo fields.
 */
export async function boot(options: BootOptions): Promise<void> {
    process.env.DATA_ROOT = path.resolve(options.dataRoot);
    process.env.STATIC_ASSETS_BASE_URL = options.assetBaseUrl;
    // Demo builds never call real AI providers, so use the mock provider.
    process.env.MOTEUR_AI_PROVIDER = 'mock';
    fs.mkdirSync(path.join(options.dataRoot, 'data', 'projects'), { recursive: true });
    const usersFile = path.join(options.dataRoot, 'data', 'users.json');
    if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]\n');
    if (booted) return;
    booted = true;

    await import('@moteurio/core/fields/index.js');
    // Importing this registers the "local" storage adapter, which reads STATIC_ASSETS_BASE_URL at import time.
    await import('@moteurio/core/assets/index.js');
    const { registerCorePlugins, registerHostPlugins } =
        await import('@moteurio/core/plugins/registerCorePlugins.js');
    await registerCorePlugins();

    const specs = (process.env.MOTEUR_HOST_PLUGINS ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const hostPlugins = [];
    for (const spec of specs) {
        try {
            const mod = await import(spec);
            hostPlugins.push(mod.default ?? mod);
        } catch (err) {
            console.warn(`[demo] Host plugin "${spec}" not loaded:`, (err as Error).message);
        }
    }
    await registerHostPlugins(hostPlugins);
}

/** Builds a user object for core service calls. Core only reads its id, name, email and roles. */
export function asUser(p: { id: string; name: string; email: string; roles: string[] }): User {
    return { id: p.id, name: p.name, email: p.email, roles: p.roles, isActive: true, projects: [] };
}

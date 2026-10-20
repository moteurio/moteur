import fs from 'fs';
import path from 'path';
import type { User } from '@moteurio/types/User.js';

export type BootOptions = {
    /** Directory holding `data/` (users.json, core/blocks, projects/). */
    dataRoot: string;
    /** Base URL baked into uploaded asset URLs (STATIC_ASSETS_BASE_URL). */
    assetBaseUrl: string;
};

let booted = false;

/**
 * Point core at the target data root and register what the API registers at startup: field
 * types, core plugins (audit, activity log, validation, git commits) and host plugins listed
 * in MOTEUR_HOST_PLUGINS (e.g. geo fields).
 */
export async function boot(options: BootOptions): Promise<void> {
    process.env.DATA_ROOT = path.resolve(options.dataRoot);
    process.env.STATIC_ASSETS_BASE_URL = options.assetBaseUrl;
    // Demo builds never call AI providers or deliver webhooks.
    process.env.MOTEUR_AI_PROVIDER = 'mock';
    fs.mkdirSync(path.join(options.dataRoot, 'data', 'projects'), { recursive: true });
    const usersFile = path.join(options.dataRoot, 'data', 'users.json');
    if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]\n');
    if (booted) return;
    booted = true;

    await import('@moteurio/core/fields/index.js');
    // Registers the "local" storage adapter (reads STATIC_ASSETS_BASE_URL at import time).
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

/** A user object for core service calls (core only reads id, name, email, roles). */
export function asUser(p: { id: string; name: string; email: string; roles: string[] }): User {
    return { id: p.id, name: p.name, email: p.email, roles: p.roles, isActive: true, projects: [] };
}

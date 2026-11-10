import fs from 'fs';
import path from 'path';
import { storageConfig } from '@moteurio/core';
import type {
    PluginCategory,
    PluginContributions,
    PluginManifest,
    PluginRole,
    PluginStudioHints
} from '@moteurio/types/Plugin.js';

/**
 * Registry of every plugin the server knows about, as loaded at startup, together with the operator's
 * saved on/off choices. Plugins load only at startup, so a choice takes effect at the next restart.
 */

export type PluginEntry = {
    id: string;
    label: string;
    description?: string;
    source?: PluginManifest['source'];
    scope?: PluginManifest['scope'];
    capabilities?: string[];
    role?: PluginRole;
    categories?: PluginCategory[];
    contributions?: PluginContributions;
    requires?: string[];
    studio?: PluginStudioHints;
    /** `core`: part of the engine and always on. `host`: chosen by the host. */
    kind: 'core' | 'host';
    /** The import specifier supplied by the host. */
    spec?: string;
    /** Whether the plugin has been running since the server started. */
    running: boolean;
    /** Whether the host's own list (MOTEUR_ENABLED_PLUGINS) allows the plugin to run. */
    hostAllows: boolean;
    /** The error message if the plugin could not be imported. */
    error?: string;
};

export type PluginChoices = Record<string, boolean>;

const entries = new Map<string, PluginEntry>();

export function recordPlugin(entry: PluginEntry): void {
    entries.set(entry.id, entry);
}

export function pluginEntries(): PluginEntry[] {
    return [...entries.values()];
}

function choicesFile(): string {
    return path.join(storageConfig.dataRoot, 'data', 'operator', 'plugins.json');
}

/** Reads the operator's choices: `true` switches a plugin on and `false` switches it off. A plugin without a choice follows the host's list. */
export function readPluginChoices(): PluginChoices {
    try {
        const raw = JSON.parse(fs.readFileSync(choicesFile(), 'utf8')) as { choices?: unknown };
        const out: PluginChoices = {};
        for (const [id, on] of Object.entries(raw.choices ?? {})) {
            if (typeof on === 'boolean') out[id] = on;
        }
        return out;
    } catch (err) {
        if ((err as { code?: string }).code !== 'ENOENT') {
            console.warn('[api] Could not read operator plugin choices:', (err as Error).message);
        }
        return {};
    }
}

export function savePluginChoice(id: string, on: boolean | null, by: string): PluginChoices {
    const choices = readPluginChoices();
    if (on === null) delete choices[id];
    else choices[id] = on;
    const file = choicesFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(
        tmp,
        JSON.stringify({ choices, updatedAt: new Date().toISOString(), updatedBy: by }, null, 2)
    );
    fs.renameSync(tmp, file);
    return choices;
}

/** Returns whether the plugin will run after the next start. */
export function runsNextStart(entry: PluginEntry, choices: PluginChoices): boolean {
    if (entry.kind === 'core') return true;
    if (entry.error) return false;
    return choices[entry.id] ?? entry.hostAllows;
}

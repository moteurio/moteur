import fs from 'fs';
import path from 'path';
import { storageConfig } from '@moteurio/core';
import type { PluginManifest, PluginStudioHints } from '@moteurio/types/Plugin.js';

/**
 * Every plugin this server knows of, as loaded at start, and the operator's saved on/off choices.
 * Plugins load once, at start: a choice applies at the next restart.
 */

export type PluginEntry = {
    id: string;
    label: string;
    description?: string;
    source?: PluginManifest['source'];
    scope?: PluginManifest['scope'];
    capabilities?: string[];
    studio?: PluginStudioHints;
    /** `core`: part of the engine, always on. `host`: chosen by the host. */
    kind: 'core' | 'host';
    /** Import specifier the host gave. */
    spec?: string;
    /** Running since this start. */
    running: boolean;
    /** The host's own list (MOTEUR_ENABLED_PLUGINS) lets it run. */
    hostAllows: boolean;
    /** Could not be imported. */
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

/** The operator's choices: `true` on, `false` off; a plugin left out follows the host's list. */
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

/** Whether a host plugin runs after the next start. */
export function runsNextStart(entry: PluginEntry, choices: PluginChoices): boolean {
    if (entry.kind === 'core') return true;
    if (entry.error) return false;
    return choices[entry.id] ?? entry.hostAllows;
}
